import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ARCHITECTURE_PATH = "docs/product/architecture.md";
const COVERAGE_PATH = "scripts/source-coverage.json";
const PROVIDERS_SECTION_START = "<!-- providers:start -->";
const PROVIDERS_SECTION_END = "<!-- providers:end -->";
const PROVIDER_ITEM = /^[-*] `(\w+Provider)`/gm;
const VALID_STATUSES = new Set(["implemented", "planned", "excluded"]);

export const readProviders = (architectureText) => {
  const start = architectureText.indexOf(PROVIDERS_SECTION_START);
  const end = architectureText.indexOf(PROVIDERS_SECTION_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`${ARCHITECTURE_PATH} needs the markers ${PROVIDERS_SECTION_START} and ${PROVIDERS_SECTION_END} around the provider list.`);
  }
  const section = architectureText.slice(start, end);
  return [...new Set([...section.matchAll(PROVIDER_ITEM)].map((match) => match[1]))];
};

const checkEntry = (provider, entry) => {
  if (!VALID_STATUSES.has(entry.status)) {
    return [`${provider} has the status ${JSON.stringify(entry.status)}; use ${[...VALID_STATUSES].join(", ")}.`];
  }
  if (!entry.reason) {
    return [`${provider} is ${entry.status} and needs a reason.`];
  }
  return [];
};

export const findDrift = (providers, coverage) => {
  const classified = Object.keys(coverage.providers);
  const problems = [];
  for (const provider of providers.filter((name) => !classified.includes(name))) {
    problems.push(`${ARCHITECTURE_PATH} lists the provider ${provider}, which is not classified in ${COVERAGE_PATH}.`);
  }
  for (const provider of classified.filter((name) => !providers.includes(name))) {
    problems.push(`${COVERAGE_PATH} lists ${provider}, which ${ARCHITECTURE_PATH} no longer lists.`);
  }
  for (const [provider, entry] of Object.entries(coverage.providers)) {
    problems.push(...checkEntry(provider, entry));
  }
  return problems;
};

const runDriftCheck = () => {
  if (!existsSync(ARCHITECTURE_PATH)) {
    process.stderr.write(`${ARCHITECTURE_PATH} does not exist.\n`);
    process.exitCode = 1;
    return;
  }
  const providers = readProviders(readFileSync(ARCHITECTURE_PATH, "utf8"));
  const coverage = JSON.parse(readFileSync(COVERAGE_PATH, "utf8"));
  const problems = findDrift(providers, coverage);
  if (problems.length > 0) {
    process.stderr.write(`${problems.join("\n")}\n`);
    process.exitCode = 1;
    return;
  }
  const planned = Object.values(coverage.providers).filter((entry) => entry.status === "planned").length;
  process.stderr.write(`Source drift: none. ${providers.length} providers classified, ${planned} still planned.\n`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runDriftCheck();
}
