import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const TIMEOUT_MS = 30_000;
const FIRST_USER_ARG = 2;
const DEFAULT_COMMAND = ["node", "dist/main.js"];
const SIGTERM = "SIGTERM";
const EXPECTED_EVENT = "environment_valid";
const MAX_SHOWN_CHARS = 80;
const PROTOCOL_VERSION = "2025-11-25";
const SERVER_NAME = "better-investment-analysis-mcp";
const EXPECTED_TOOLS = ["get_overview", "get_guide", "query_sql"];
const INITIALIZE_ID = 1;
const TOOLS_LIST_ID = 2;

// Why: the smoke talks the real protocol: initialize, then tools/list, then closes stdin so the server exits on its own.
const MCP_REQUESTS = [
  { jsonrpc: "2.0", id: INITIALIZE_ID, method: "initialize", params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "smoke", version: "0.0.0" } } },
  { jsonrpc: "2.0", method: "notifications/initialized" },
  { jsonrpc: "2.0", id: TOOLS_LIST_ID, method: "tools/list" },
];

export const parseCommand = (argv) => {
  const separatorIndex = argv.indexOf("--");
  const command = separatorIndex === -1 ? argv : argv.slice(separatorIndex + 1);
  return { command: command.length === 0 ? DEFAULT_COMMAND : command };
};

const truncateLine = (line) => line.slice(0, MAX_SHOWN_CHARS);

const parseLines = (text, problems, describeProblem) => {
  return text.split("\n").filter((line) => line.trim() !== "").flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      const shownLine = truncateLine(line);
      problems.push(describeProblem(shownLine));
      return [];
    }
  });
};

const findResult = (messages, id) => messages.find((message) => message.id === id)?.result;

export const checkRun = ({ code, stdout, stderr }) => {
  const problems = [];
  if (code !== 0) {
    problems.push(`the program exited with code ${code}, expected 0`);
  }
  // Why: stdout belongs to the MCP protocol, so every line on it must be a protocol message.
  const messages = parseLines(stdout, problems, (line) => `stdout carries a line that is not an MCP message: ${line}`);
  const events = parseLines(stderr, problems, (line) => `stderr carries a line that is not a JSON log line: ${line}`);
  if (!events.some((event) => event.event === EXPECTED_EVENT)) {
    problems.push(`stderr has no ${EXPECTED_EVENT} log line`);
  }
  const initializeResult = findResult(messages, INITIALIZE_ID);
  if (initializeResult?.serverInfo?.name !== SERVER_NAME) {
    problems.push(`initialize did not answer with the server name ${SERVER_NAME}`);
  }
  if (typeof initializeResult?.instructions !== "string" || initializeResult.instructions === "") {
    problems.push("initialize did not answer with server instructions");
  }
  const toolNames = findResult(messages, TOOLS_LIST_ID)?.tools?.map((tool) => tool.name);
  if (JSON.stringify(toolNames) !== JSON.stringify(EXPECTED_TOOLS)) {
    problems.push(`tools/list answered ${JSON.stringify(toolNames)}, expected ${JSON.stringify(EXPECTED_TOOLS)}`);
  }
  return problems;
};

const stopChildProcessTree = (child) => {
  if (child.pid === undefined) {
    child.kill();
    return;
  }
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
    return;
  }
  try {
    process.kill(-child.pid, SIGTERM);
  } catch {
    child.kill(SIGTERM);
  }
};

const runProgram = (command) => {
  return new Promise((resolve, reject) => {
    const [program, ...args] = command;
    const child = spawn(program, args, { stdio: ["pipe", "pipe", "pipe"], detached: process.platform !== "win32" });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      stopChildProcessTree(child);
      reject(new Error(`the program did not exit after ${TIMEOUT_MS} ms`));
    }, TIMEOUT_MS);
    child.on("error", reject);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.stdin.end(MCP_REQUESTS.map((request) => `${JSON.stringify(request)}\n`).join(""));
  });
};

const runSmoke = async (command) => {
  const problems = checkRun(await runProgram(command));
  if (problems.length > 0) {
    process.stderr.write(`${problems.join("\n")}\n`);
    return 1;
  }
  process.stdout.write(`smoke ok: ${command.join(" ")}\n`);
  return 0;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(await runSmoke(parseCommand(process.argv.slice(FIRST_USER_ARG)).command));
}
