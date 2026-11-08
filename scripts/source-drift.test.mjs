import { describe, expect, it } from "vitest";
import { findDrift, readProviders } from "./source-drift.mjs";

const buildArchitecture = (names) => {
  const items = names.map((name) => `- \`${name}\`: something`).join("\n");
  return `# Architecture\n<!-- providers:start -->\n${items}\n<!-- providers:end -->\n- \`OtherProvider\`: after the markers\n`;
};

describe("readProviders()", () => {
  it("reads the providers between the markers and ignores the rest of the file", () => {
    const providers = readProviders(buildArchitecture(["QuoteProvider", "MacroProvider"]));

    expect(providers).toStrictEqual(["QuoteProvider", "MacroProvider"]);
  });

  it("throws when the markers are missing", () => {
    expect(() => readProviders("# Architecture")).toThrow(/needs the markers/);
  });
});

describe("findDrift()", () => {
  const planned = { status: "planned", reason: "later" };

  it("passes when every provider is classified", () => {
    const coverage = { providers: { QuoteProvider: planned, MacroProvider: { status: "implemented", reason: "BCB adapter" } } };

    const problems = findDrift(["QuoteProvider", "MacroProvider"], coverage);

    expect(problems).toStrictEqual([]);
  });

  it("names a provider that the architecture lists and the file lacks", () => {
    const coverage = { providers: { QuoteProvider: planned } };

    const problems = findDrift(["QuoteProvider", "MacroProvider"], coverage);

    expect(problems).toStrictEqual([
      "docs/product/architecture.md lists the provider MacroProvider, which is not classified in scripts/source-coverage.json.",
    ]);
  });

  it("names a classified provider that the architecture no longer lists", () => {
    const coverage = { providers: { QuoteProvider: planned, OldProvider: planned } };

    const problems = findDrift(["QuoteProvider"], coverage);

    expect(problems).toStrictEqual([
      "scripts/source-coverage.json lists OldProvider, which docs/product/architecture.md no longer lists.",
    ]);
  });

  it("refuses a status that does not exist", () => {
    const coverage = { providers: { QuoteProvider: { status: "maybe", reason: "x" } } };

    const problems = findDrift(["QuoteProvider"], coverage);

    expect(problems).toStrictEqual(["QuoteProvider has the status \"maybe\"; use implemented, planned, excluded."]);
  });

  it("asks for a reason on every entry", () => {
    const coverage = { providers: { QuoteProvider: { status: "excluded" } } };

    const problems = findDrift(["QuoteProvider"], coverage);

    expect(problems).toStrictEqual(["QuoteProvider is excluded and needs a reason."]);
  });
});
