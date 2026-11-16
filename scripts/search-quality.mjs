import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { formatTable, MRR_CUTOFF, readRelevantSeqs, scoreMode } from "./search-quality/metrics.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = join(HERE, "..", "dist", "main.js");
const QUESTIONS_PATH = join(HERE, "search-quality", "questions.json");
const CACHE_PREFIX = "search-quality-";
const BACKGROUND_AFTER_SECONDS = "600";
const CALL_TIMEOUT_MS = 900000;
const POLL_MS = 5000;
const MAX_POLLS = 120;
const SHOWN_CHARS = 300;
const ROW_PREFIX = "{";
const FIRST_USER_ARG = 2;
const JSON_INDENT = 2;
const QUERY_TOOL = "query_sql";
const FILING_PREFIX = "fre:BR:stock:";
const STOCK_PREFIX = "BR:stock:";
const NO_LIMIT_SECTION = "NULL";
const COUNT_FIELD = "n";
const SEQ_FIELD = "seq";
const MODES = [
  { key: "keywords", label: "(a) Keywords with variants, no filter", usesPhrase: false, usesQuestion: false },
  { key: "keywords_phrase", label: "(c) Keywords with variants and an ILIKE phrase filter", usesPhrase: true, usesQuestion: false },
  { key: "question", label: "(d) Any word, the full question as the query", usesPhrase: false, usesQuestion: true },
];

const escapeSqlText = (text) => text.replace(/'/gu, "''");

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const parseRows = (text) => text.split("\n")
  .filter((line) => line.startsWith(ROW_PREFIX))
  .map((line) => JSON.parse(line));

const readMessage = (result) => result.content.map((part) => part.text ?? "").join("\n");

const runSql = async (client, label, sql) => {
  for (let poll = 0; poll < MAX_POLLS; poll += 1) {
    // Why: a query on a filing that is still loading returns the rows stored so far; the query is run again until no load is running.
    const request = { name: QUERY_TOOL, arguments: { sql } };
    const result = await client.callTool(request, undefined, { timeout: CALL_TIMEOUT_MS });
    const text = readMessage(result);
    if (result.isError === true) {
      throw new Error(`${label}: the query failed: ${text.slice(0, SHOWN_CHARS)}`);
    }
    if (result.structuredContent?.loadingId === undefined) {
      return parseRows(text);
    }
    await sleep(POLL_MS);
  }
  throw new Error(`${label}: the load did not finish after ${MAX_POLLS} polls`);
};

const loadFiling = async (client, asset, filing) => {
  const rows = await runSql(client, filing, `SELECT count(*) AS ${COUNT_FIELD} FROM asset_filing_chunks WHERE asset_id = '${asset}' AND filing_id = '${filing}'`);
  const count = Number(rows[0]?.[COUNT_FIELD] ?? 0);
  if (count === 0) {
    throw new Error(`${filing}: the filing did not load (no chunk); RAD may have answered a web page or the transfer was cut`);
  }
  return count;
};

const resolveQuotes = async (client, asset, filing, question) => {
  const quoteToSeqs = new Map();
  for (const relevant of question.relevant) {
    const sql = `SELECT seq FROM asset_filing_chunks WHERE asset_id = '${asset}' AND filing_id = '${filing}' AND strpos(regexp_replace(text, '\\s+', ' ', 'g'), '${escapeSqlText(relevant.quote)}') > 0 ORDER BY seq`;
    const rows = await runSql(client, question.id, sql);
    quoteToSeqs.set(relevant.quote, rows.map((row) => Number(row[SEQ_FIELD])));
  }
  return readRelevantSeqs(question, quoteToSeqs);
};

const buildPhraseFilter = (mode, question) => (mode.usesPhrase ? `AND text ILIKE '%${escapeSqlText(question.phrase)}%'` : "");

const readQueryText = (mode, question) => (mode.usesQuestion ? question.question : question.keywords);

const searchMode = async (client, asset, filing, question, mode) => {
  const from = `FROM search_chunks('${escapeSqlText(readQueryText(mode, question))}', '${asset}', 'fre', ${NO_LIMIT_SECTION}, 'text') WHERE filing_id = '${filing}' ${buildPhraseFilter(mode, question)}`;
  const top = await runSql(client, question.id, `SELECT seq ${from} ORDER BY score DESC, seq LIMIT ${MRR_CUTOFF}`);
  const counted = await runSql(client, question.id, `SELECT count(*) AS ${COUNT_FIELD} ${from}`);
  return { top: top.map((row) => Number(row[SEQ_FIELD])), matched: Number(counted[0]?.[COUNT_FIELD] ?? 0) };
};

const groupByFiling = (questions) => {
  const filingToQuestions = new Map();
  for (const question of questions) {
    const filing = `${FILING_PREFIX}${question.ticker}:${question.id_doc}`;
    const list = filingToQuestions.get(filing) ?? [];
    list.push(question);
    filingToQuestions.set(filing, list);
  }
  return filingToQuestions;
};

const runQuality = async (client, questions) => {
  const modeToAnswers = new Map(MODES.map((mode) => [mode.key, []]));
  const details = [];
  for (const [filing, list] of groupByFiling(questions)) {
    const asset = `${STOCK_PREFIX}${list[0]?.ticker ?? ""}`;
    await loadFiling(client, asset, filing);
    for (const question of list) {
      const relevantSeqs = await resolveQuotes(client, asset, filing, question);
      const perMode = {};
      for (const mode of MODES) {
        const found = await searchMode(client, asset, filing, question, mode);
        modeToAnswers.get(mode.key)?.push({ ...found, relevantSeqs });
        perMode[mode.key] = found;
      }
      details.push({ id: question.id, modes: perMode, relevantSeqs });
    }
  }
  const rows = MODES.map((mode) => ({ label: mode.label, score: scoreMode(modeToAnswers.get(mode.key) ?? []) }));
  return { rows, details };
};

const parseArguments = (argv) => {
  const outIndex = argv.indexOf("--out");
  const outPath = outIndex === -1 ? undefined : argv[outIndex + 1];
  const positional = argv.filter((value, index) => value !== "--out" && index !== outIndex + 1);
  const [givenCacheDir] = positional;
  const cachePrefix = join(tmpdir(), CACHE_PREFIX);
  const freshCacheDir = mkdtempSync(cachePrefix);
  return { cacheDir: givenCacheDir ?? freshCacheDir, outPath };
};

const runCli = async () => {
  const userArguments = globalThis.process.argv.slice(FIRST_USER_ARG);
  const { cacheDir, outPath } = parseArguments(userArguments);
  const questions = JSON.parse(readFileSync(QUESTIONS_PATH, "utf8"));
  const transport = new StdioClientTransport({
    command: "node",
    args: [SERVER_ENTRY],
    env: {
      ...globalThis.process.env,
      INVESTMENT_MCP_CACHE_DIR: cacheDir,
      INVESTMENT_MCP_BACKGROUND_AFTER_SECONDS: BACKGROUND_AFTER_SECONDS,
    },
  });
  const client = new Client({ name: "search-quality", version: "1.0.0" });
  await client.connect(transport);
  try {
    const { rows, details } = await runQuality(client, questions);
    globalThis.process.stdout.write(`${formatTable(rows)}\n`);
    if (outPath !== undefined) {
      const report = { date: new Date().toISOString(), cacheDir, details, rows };
      writeFileSync(outPath, `${JSON.stringify(report, null, JSON_INDENT)}\n`);
    }
  } finally {
    await client.close();
  }
};

runCli().catch((error) => {
  globalThis.process.stderr.write(`search quality stopped: ${error instanceof Error ? error.message : String(error)}\n`);
  globalThis.process.exitCode = 1;
});
