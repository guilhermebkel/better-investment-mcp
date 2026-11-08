import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OPERATIONS_DIR = "src/Operations";
const OPERATION_FILE = /Operation\.ts$/;
const NAME_PATTERN = /static readonly NAME = "(\w+)"/;
const UPPER_CASE_LETTER = /[A-Z]/g;
const COUNT_PATTERN = /<!-- tools:count -->\s*(\d+)\s*<!-- \/tools:count -->/g;
const LIST_PATTERN = /<!-- tools:list -->([\s\S]*?)<!-- \/tools:list -->/g;
const LIST_ITEM = /^[-*] `(\w+)`/gm;

// Why: the number and the names of the tools are stated by hand only inside these markers, so a tool name in code format anywhere else (a planned tool in prose) never fails the check.
export const SPECS = [
  { path: "README.md", count: true, list: true },
  { path: "AGENTS.md", count: true, list: false },
];

export const readToolNames = (sources) => {
  return sources.map(({ path, text }) => {
    const name = NAME_PATTERN.exec(text)?.[1];
    if (name === undefined) {
      throw new Error(`${path} has no static NAME to read.`);
    }
    // Why: the client sees the snake_case name derived from the camelCase NAME, as src/Surfaces/OperationManifestSurface.ts does.
    return name.replaceAll(UPPER_CASE_LETTER, (letter) => `_${letter.toLowerCase()}`);
  });
};

const findLine = (text, index) => text.slice(0, index).split("\n").length;

const checkCount = (spec, text, realNames) => {
  const matches = [...text.matchAll(COUNT_PATTERN)];
  if (matches.length === 0) {
    return [`${spec.path} has no tools:count marker to read.`];
  }
  return matches
    .filter((match) => Number(match[1]) !== realNames.length)
    .map((match) => `${spec.path}:${findLine(text, match.index)} says ${match[1]} tools, the real number is ${realNames.length}.`);
};

const checkList = (spec, text, realNames) => {
  const sections = [...text.matchAll(LIST_PATTERN)];
  if (sections.length === 0) {
    return [`${spec.path} has no tools:list marker to read.`];
  }
  const listed = sections.flatMap((section) => [...section[1].matchAll(LIST_ITEM)].map((item) => item[1]));
  const problems = [];
  for (const name of listed.filter((item) => !realNames.includes(item))) {
    problems.push(`${spec.path} lists the tool ${name}, which src/Operations does not have.`);
  }
  for (const name of realNames.filter((item) => !listed.includes(item))) {
    problems.push(`${spec.path} does not list the tool ${name}, which src/Operations has.`);
  }
  return problems;
};

export const findDocProblems = (specs, texts, realNames) => {
  return specs.flatMap((spec) => {
    const text = texts[spec.path];
    if (text === undefined) {
      return [`${spec.path} does not exist.`];
    }
    return [
      ...(spec.count ? checkCount(spec, text, realNames) : []),
      ...(spec.list ? checkList(spec, text, realNames) : []),
    ];
  });
};

const readOperationSources = () => {
  if (!existsSync(OPERATIONS_DIR)) {
    return [];
  }
  return readdirSync(OPERATIONS_DIR)
    .filter((file) => OPERATION_FILE.test(file) && !file.endsWith(".test.ts"))
    .map((file) => ({ path: `${OPERATIONS_DIR}/${file}`, text: readFileSync(`${OPERATIONS_DIR}/${file}`, "utf8") }));
};

const runDocCheck = () => {
  const realNames = readToolNames(readOperationSources());
  const texts = Object.fromEntries(SPECS.filter((spec) => existsSync(spec.path)).map((spec) => [spec.path, readFileSync(spec.path, "utf8")]));
  const problems = findDocProblems(SPECS, texts, realNames);
  if (problems.length > 0) {
    process.stderr.write(`${problems.join("\n")}\n`);
    process.exitCode = 1;
    return;
  }
  process.stderr.write(`Tool docs: consistent. ${realNames.length} tools in src/Operations.\n`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runDocCheck();
}
