import { describe, expect, it } from "vitest";
import { YfinanceAdapter } from "@/Adapters/Yfinance/YfinanceAdapter.ts";

// Why: the Python library is replaced by a recorded answer of the same shape; the live check runs the real library.
const ANSWER = JSON.stringify({
  quotes: [
    { date: "2026-11-02", open: 37.1, high: 37.5, low: 36.9, close: 37.3, adjClose: 36.2, volume: 1000 },
    { date: "2026-11-03", open: null, high: null, low: null, close: null, adjClose: null, volume: null },
    { date: "2026-11-04", open: 37.4, high: 37.9, low: 37.2, close: 37.3, adjClose: 36.2, volume: 0 },
  ],
  dividends: [{ exDate: "2026-10-15", amount: 0.5 }],
  splits: [{ date: "2019-01-02", ratio: 2 }],
  currency: "BRL",
  name: "Petroleo Brasileiro S.A.",
});

const buildAdapter = (answer: string, symbols: string[] = []): YfinanceAdapter<"quotes"> => new YfinanceAdapter("quotes", (symbol) => {
  symbols.push(symbol);
  return Promise.resolve(answer);
});

describe("YfinanceAdapter.fetchTables()", () => {
  it("asks the library for the Brazilian symbol with the .SA suffix, and no other", async () => {
    const symbols: string[] = [];
    await buildAdapter(ANSWER, symbols).fetchTables({ market: "BR", ticker: "PETR4", assetType: "stock" });

    expect(symbols).toStrictEqual(["PETR4.SA"]);
  });

  it("writes the quotes, skipping a day with no close, and flags the day that repeats with zero volume", async () => {
    const result = await buildAdapter(ANSWER).fetchTables({ market: "BR", ticker: "PETR4", assetType: "stock" });

    expect(result.tables.quotes).toHaveLength(2);
    expect(result.tables.quotes?.[0]).toMatchObject({ date: "2026-11-02", close: 37.3, adj_close: 36.2, source: "yfinance" });
    expect(result.tables.quotes?.[1]).toMatchObject({ date: "2026-11-04", is_stale: true });
  });

  it("writes the dividends and splits with their dates, and the asset name", async () => {
    const result = await buildAdapter(ANSWER).fetchTables({ market: "BR", ticker: "PETR4", assetType: "stock" });

    expect(result.tables.dividends?.[0]).toMatchObject({ ex_date: "2026-10-15", amount: 0.5, kind: "dividend", source: "yfinance" });
    expect(result.tables.splits?.[0]).toMatchObject({ date: "2019-01-02", ratio: 2 });
    expect(result.tables.assets?.[0]).toMatchObject({ name: "Petroleo Brasileiro S.A.", currency: "BRL" });
  });

  it("refuses an answer of another shape, and writes nothing", async () => {
    await expect(buildAdapter("{\"unexpected\": true}").fetchTables({ market: "BR", ticker: "PETR4", assetType: "stock" })).rejects.toThrow(
      "the response format changed: yfinance sent an unknown shape for PETR4.SA; no row was written",
    );
  });

  it("names the market it does not map", () => {
    expect(() => YfinanceAdapter.buildSymbol("XX", "PETR4")).toThrow("yfinance does not map the market XX to a symbol");
  });
});
