import { describe, expect, it } from "vitest";
import { checkRun, parseCommand } from "./package-smoke.mjs";

const GOOD_STDERR = "{\"level\":\"info\",\"event\":\"environment_valid\"}\n";
const GOOD_INITIALIZE = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  result: { protocolVersion: "2025-11-25", serverInfo: { name: "better-investment-analysis-mcp", version: "0.0.0" }, instructions: "This server only reads." },
});
const GOOD_TOOLS_LIST = JSON.stringify({
  jsonrpc: "2.0",
  id: 2,
  result: { tools: [{ name: "get_overview" }, { name: "get_guide" }, { name: "query_sql" }] },
});
const GOOD_STDOUT = `${GOOD_INITIALIZE}\n${GOOD_TOOLS_LIST}\n`;

describe("checkRun()", () => {
  it("passes when the program exits 0, speaks only MCP on stdout and lists the three tools", () => {
    expect(checkRun({ code: 0, stdout: GOOD_STDOUT, stderr: GOOD_STDERR })).toStrictEqual([]);
  });

  it("fails on a non-zero exit code", () => {
    expect(checkRun({ code: 1, stdout: GOOD_STDOUT, stderr: GOOD_STDERR })).toContain("the program exited with code 1, expected 0");
  });

  it("fails when stdout carries a line that is not an MCP message", () => {
    expect(checkRun({ code: 0, stdout: `hello\n${GOOD_STDOUT}`, stderr: GOOD_STDERR })).toStrictEqual([
      "stdout carries a line that is not an MCP message: hello",
    ]);
  });

  it("fails when stderr has a line that is not JSON", () => {
    expect(checkRun({ code: 0, stdout: GOOD_STDOUT, stderr: `oops\n${GOOD_STDERR}` })).toStrictEqual([
      "stderr carries a line that is not a JSON log line: oops",
    ]);
  });

  it("fails when the start-up event is missing", () => {
    expect(checkRun({ code: 0, stdout: GOOD_STDOUT, stderr: "" })).toStrictEqual(["stderr has no environment_valid log line"]);
  });

  it("fails when the server does not answer initialize with its name", () => {
    const wrongName = GOOD_INITIALIZE.replace("better-investment-analysis-mcp", "another-server");

    expect(checkRun({ code: 0, stdout: `${wrongName}\n${GOOD_TOOLS_LIST}\n`, stderr: GOOD_STDERR })).toStrictEqual([
      "initialize did not answer with the server name better-investment-analysis-mcp",
    ]);
  });

  it("fails when tools/list has an extra tool", () => {
    const extraTool = GOOD_TOOLS_LIST.replace("query_sql", "query_sql\"},{\"name\":\"delete_all");

    expect(checkRun({ code: 0, stdout: `${GOOD_INITIALIZE}\n${extraTool}\n`, stderr: GOOD_STDERR })).toStrictEqual([
      "tools/list answered [\"get_overview\",\"get_guide\",\"query_sql\",\"delete_all\"], expected [\"get_overview\",\"get_guide\",\"query_sql\"]",
    ]);
  });
});

describe("parseCommand()", () => {
  it("runs the built file when no command is given", () => {
    expect(parseCommand([])).toStrictEqual({ command: ["node", "dist/main.js"] });
  });

  it("takes the command after the separator", () => {
    expect(parseCommand(["--", "docker", "run", "-i", "image"])).toStrictEqual({ command: ["docker", "run", "-i", "image"] });
  });

  it("takes the whole list as the command when there is no separator", () => {
    expect(parseCommand(["npx", "pkg"])).toStrictEqual({ command: ["npx", "pkg"] });
  });
});
