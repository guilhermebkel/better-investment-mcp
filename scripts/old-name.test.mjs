import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const OLD_NAME = "better-investment-analysis";
const ALLOWED = [/^docs\/adr\//, /^CHANGELOG\.md$/, /^pnpm-lock\.yaml$/, /^scripts\/old-name\.test\.mjs$/];

describe("project name", () => {
  it("is not the old one in any tracked file", () => {
    const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);

    const offenders = tracked
      .filter((path) => !ALLOWED.some((pattern) => pattern.test(path)))
      .filter((path) => readFileSync(path, "utf8").includes(OLD_NAME));

    expect(offenders).toStrictEqual([]);
  });
});
