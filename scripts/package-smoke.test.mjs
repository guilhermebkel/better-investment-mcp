import { describe, expect, it } from "vitest";
import { checkHttpRun, checkRun, parseCommand } from "./package-smoke.mjs";

const GOOD_STDERR = "{\"level\":\"info\",\"event\":\"environment_valid\"}\n";
const SERVER_NAME = "better-investment-mcp";
const GOOD_INSTRUCTIONS = "The server only reads, except notify_load_finish";
const GOOD_INITIALIZE = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  result: { protocolVersion: "2025-11-25", serverInfo: { name: SERVER_NAME, version: "0.0.0" }, instructions: GOOD_INSTRUCTIONS },
});
const GOOD_TOOLS_LIST = JSON.stringify({
  jsonrpc: "2.0",
  id: 2,
  result: { tools: [{ name: "get_overview" }, { name: "get_guide" }, { name: "query_sql" }, { name: "notify_load_finish" }] },
});
const GOOD_STDOUT = `${GOOD_INITIALIZE}\n${GOOD_TOOLS_LIST}\n`;
const GOOD_HTTP = {
  name: SERVER_NAME,
  instructions: GOOD_INSTRUCTIONS,
  toolNames: ["get_overview", "get_guide", "query_sql", "notify_load_finish"],
  unauthorizedStatus: 401,
};

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
    const wrongName = GOOD_INITIALIZE.replace(SERVER_NAME, "another-server");

    expect(checkRun({ code: 0, stdout: `${wrongName}\n${GOOD_TOOLS_LIST}\n`, stderr: GOOD_STDERR })).toStrictEqual([
      `initialize did not answer with the server name ${SERVER_NAME}`,
    ]);
  });

  it("fails when tools/list has an extra tool", () => {
    const extraTool = GOOD_TOOLS_LIST.replace("query_sql", "query_sql\"},{\"name\":\"delete_all");

    expect(checkRun({ code: 0, stdout: `${GOOD_INITIALIZE}\n${extraTool}\n`, stderr: GOOD_STDERR })).toStrictEqual([
      "tools/list answered [\"get_overview\",\"get_guide\",\"query_sql\",\"delete_all\",\"notify_load_finish\"], expected [\"get_overview\",\"get_guide\",\"query_sql\",\"notify_load_finish\"]",
    ]);
  });
});

describe("checkHttpRun()", () => {
  it("passes when the name, the instructions, the four tools and the 401 without a token are right", () => {
    expect(checkHttpRun(GOOD_HTTP)).toStrictEqual([]);
  });

  it("fails when /mcp answers without a token with anything but 401", () => {
    expect(checkHttpRun({ ...GOOD_HTTP, unauthorizedStatus: 200 })).toStrictEqual([
      "HTTP /mcp without a token answered 200, expected 401",
    ]);
  });

  it("fails when the instructions do not say the server only reads, except notify_load_finish", () => {
    expect(checkHttpRun({ ...GOOD_HTTP, instructions: "A server." })).toStrictEqual([
      "HTTP instructions do not say the server only reads, except notify_load_finish",
    ]);
  });

  it("fails when tools/list over HTTP has a different set of tools", () => {
    expect(checkHttpRun({ ...GOOD_HTTP, toolNames: ["get_overview"] })).toStrictEqual([
      "HTTP tools/list answered [\"get_overview\"], expected [\"get_overview\",\"get_guide\",\"query_sql\",\"notify_load_finish\"]",
    ]);
  });
});

describe("parseCommand()", () => {
  it("runs the built file over stdio when no command is given", () => {
    expect(parseCommand([])).toStrictEqual({ command: ["node", "dist/main.js"], isStdioOnly: false, isHttpOnly: false });
  });

  it("takes the command after the separator", () => {
    expect(parseCommand(["--", "docker", "run", "-i", "image"])).toStrictEqual({
      command: ["docker", "run", "-i", "image"],
      isStdioOnly: false,
      isHttpOnly: false,
    });
  });

  it("takes the whole list as the command when there is no separator", () => {
    expect(parseCommand(["npx", "pkg"])).toStrictEqual({ command: ["npx", "pkg"], isStdioOnly: false, isHttpOnly: false });
  });

  it("reads --stdio-only before the separator and leaves it out of the command", () => {
    expect(parseCommand(["--stdio-only", "--", "docker", "run", "-i", "image"])).toStrictEqual({
      command: ["docker", "run", "-i", "image"],
      isStdioOnly: true,
      isHttpOnly: false,
    });
  });

  it("reads --http-only without a separator and leaves it out of the command", () => {
    expect(parseCommand(["--http-only", "npx", "pkg"])).toStrictEqual({ command: ["npx", "pkg"], isStdioOnly: false, isHttpOnly: true });
  });
});
