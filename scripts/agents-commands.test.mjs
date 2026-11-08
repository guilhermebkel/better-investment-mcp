import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");
const PNPM_COMMAND = /pnpm ([a-z][\w:-]*)/gu;
const PNPM_BUILTINS = new Set(["install", "exec", "run", "add", "approve-builds"]);
// Why: these scripts are called by other scripts (`pnpm lint` runs the first two, lint-staged runs the third), so AGENTS.md lists the commands that call them.
const INTERNAL_SCRIPTS = new Set(["lint:oxlint", "lint:eslint", "lint-staged"]);

const readScriptNames = () => {
  const packageText = readFileSync(join(ROOT, "package.json"), "utf8");
  return Object.keys(JSON.parse(packageText).scripts);
};

const findUnknownCommands = (file, scriptNames) => {
  const text = readFileSync(join(ROOT, file), "utf8");
  const commands = [...new Set([...text.matchAll(PNPM_COMMAND)].map((match) => match[1]))];
  return commands.filter((name) => !PNPM_BUILTINS.has(name) && !scriptNames.includes(name)).map((name) => `${file}: pnpm ${name}`);
};

describe("commands named in AGENTS.md and the README", () => {
  it("all exist in package.json", () => {
    const scriptNames = readScriptNames();

    const unknown = ["AGENTS.md", "README.md"].flatMap((file) => findUnknownCommands(file, scriptNames));

    expect(unknown).toStrictEqual([]);
  });

  it("include every command AGENTS.md lists in its Commands section", () => {
    const scriptNames = readScriptNames();
    const text = readFileSync(join(ROOT, "AGENTS.md"), "utf8");

    const missing = scriptNames.filter((name) => !text.includes(`pnpm ${name}`) && !INTERNAL_SCRIPTS.has(name));

    expect(missing).toStrictEqual([]);
  });
});
