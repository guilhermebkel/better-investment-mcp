import { describe, expect, it } from "vitest";
import { findDocProblems, readToolNames } from "./check-tool-docs.mjs";

const SPECS = [
  { path: "README.md", count: true, list: true },
  { path: "AGENTS.md", count: true, list: false },
];

const buildList = (names) => names.map((name) => `- \`${name}\``).join("\n");
const buildReadme = (count, names) => {
  const list = buildList(names);
  return `<!-- tools:count -->${count}<!-- /tools:count -->\n<!-- tools:list -->\n${list}\n<!-- /tools:list -->\n`;
};
const buildAgents = (count) => `Exposes <!-- tools:count -->${count}<!-- /tools:count --> tools.\n`;

describe("readToolNames()", () => {
  it("reads the static NAME of each operation", () => {
    const sources = [{ path: "src/Operations/QuerySqlOperation.ts", text: "static readonly NAME = \"query_sql\";" }];

    expect(readToolNames(sources)).toStrictEqual(["query_sql"]);
  });

  it("throws when an operation has no static NAME", () => {
    expect(() => readToolNames([{ path: "src/Operations/XOperation.ts", text: "" }])).toThrow(/no static NAME/);
  });
});

describe("findDocProblems()", () => {
  it("passes when the count and the names match", () => {
    const texts = { "README.md": buildReadme(1, ["query_sql"]), "AGENTS.md": buildAgents(1) };

    const problems = findDocProblems(SPECS, texts, ["query_sql"]);

    expect(problems).toStrictEqual([]);
  });

  it("passes with zero tools and an empty list", () => {
    const texts = { "README.md": buildReadme(0, []), "AGENTS.md": buildAgents(0) };

    const problems = findDocProblems(SPECS, texts, []);

    expect(problems).toStrictEqual([]);
  });

  it("fails when README states a wrong count and names the file, the line and both numbers", () => {
    const texts = { "README.md": buildReadme(3, ["query_sql"]), "AGENTS.md": buildAgents(1) };

    const problems = findDocProblems(SPECS, texts, ["query_sql"]);

    expect(problems).toStrictEqual(["README.md:1 says 3 tools, the real number is 1."]);
  });

  it("fails when AGENTS.md states a wrong count", () => {
    const texts = { "README.md": buildReadme(1, ["query_sql"]), "AGENTS.md": buildAgents(2) };

    const problems = findDocProblems(SPECS, texts, ["query_sql"]);

    expect(problems).toStrictEqual(["AGENTS.md:1 says 2 tools, the real number is 1."]);
  });

  it("fails when README lists a tool the code does not have", () => {
    const texts = { "README.md": buildReadme(1, ["query_sql", "write_cache"]), "AGENTS.md": buildAgents(1) };

    const problems = findDocProblems(SPECS, texts, ["query_sql"]);

    expect(problems).toStrictEqual(["README.md lists the tool write_cache, which src/Operations does not have."]);
  });

  it("fails when README leaves out a tool the code has", () => {
    const texts = { "README.md": buildReadme(2, ["query_sql"]), "AGENTS.md": buildAgents(2) };

    const problems = findDocProblems(SPECS, texts, ["query_sql", "get_guide"]);

    expect(problems).toStrictEqual(["README.md does not list the tool get_guide, which src/Operations has."]);
  });

  it("ignores a tool name in code format outside the markers", () => {
    const readme = buildReadme(0, []);
    const texts = { "README.md": `${readme}The planned \`query_sql\` tool.\n`, "AGENTS.md": buildAgents(0) };

    const problems = findDocProblems(SPECS, texts, []);

    expect(problems).toStrictEqual([]);
  });

  it("fails when a file has no marker to read", () => {
    const texts = { "README.md": "nothing here", "AGENTS.md": buildAgents(0) };

    const problems = findDocProblems(SPECS, texts, []);

    expect(problems).toStrictEqual([
      "README.md has no tools:count marker to read.",
      "README.md has no tools:list marker to read.",
    ]);
  });

  it("fails when a file does not exist", () => {
    const problems = findDocProblems(SPECS, { "AGENTS.md": buildAgents(0) }, []);

    expect(problems).toStrictEqual(["README.md does not exist."]);
  });
});
