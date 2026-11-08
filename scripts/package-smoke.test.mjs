import { describe, expect, it } from "vitest";
import { checkRun, parseCommand } from "./package-smoke.mjs";

const GOOD_STDERR = "{\"level\":\"info\",\"event\":\"environment_valid\"}\n";

describe("checkRun()", () => {
  it("passes when the program exits 0, leaves stdout empty and logs the start-up event", () => {
    expect(checkRun({ code: 0, stdout: "", stderr: GOOD_STDERR })).toStrictEqual([]);
  });

  it("fails on a non-zero exit code", () => {
    expect(checkRun({ code: 1, stdout: "", stderr: GOOD_STDERR })).toStrictEqual(["the program exited with code 1, expected 0"]);
  });

  it("fails when the program writes to stdout", () => {
    expect(checkRun({ code: 0, stdout: "hello\n", stderr: GOOD_STDERR })).toStrictEqual([
      "the program wrote to stdout, which is reserved for the MCP protocol",
    ]);
  });

  it("fails when stderr has a line that is not JSON", () => {
    expect(checkRun({ code: 0, stdout: "", stderr: `oops\n${GOOD_STDERR}` })).toStrictEqual([
      "stderr carries a line that is not a JSON log line: oops",
    ]);
  });

  it("fails when the start-up event is missing", () => {
    expect(checkRun({ code: 0, stdout: "", stderr: "" })).toStrictEqual(["stderr has no environment_valid log line"]);
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
