import { describe, expect, it } from "vitest";
import { YfinanceAdapter } from "@/Adapters/Yfinance/YfinanceAdapter.ts";
const PETR4_ASSET = "BR:stock:PETR4";
const QUOTE_DAY = "2026-11-02";
const EX_DAY = "2026-10-15";
const COMPANY_NAME = "Petroleo Brasileiro S.A.";

// Why: the Python library is replaced by a recorded answer of the same shape; the live check runs the real library.
const ANSWER = JSON.stringify({
  quotes: [
    { date: QUOTE_DAY, open: 37.1, high: 37.5, low: 36.9, close: 37.3, adjClose: 36.2, volume: 1000 },
    { date: "2026-11-03", open: null, high: null, low: null, close: null, adjClose: null, volume: null },
    { date: "2026-11-04", open: 37.4, high: 37.9, low: 37.2, close: 37.3, adjClose: 36.2, volume: 0 },
  ],
  dividends: [{ exDate: EX_DAY, amount: 0.5 }],
  splits: [{ date: "2019-01-02", ratio: 2 }],
  currency: "BRL",
  name: COMPANY_NAME,
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

    expect(result.tables.asset_quotes).toHaveLength(2);
    expect(result.tables.asset_quotes?.[0]).toMatchObject({
      asset_id: PETR4_ASSET, reference_time_start: QUOTE_DAY, close: 37.3, adj_close: 36.2,
    });
    expect(result.tables.asset_quotes?.[1]).toMatchObject({ reference_time_start: "2026-11-04", is_stale: true });
  });

  it("writes the dividends and splits with their dates, and the asset name", async () => {
    const result = await buildAdapter(ANSWER).fetchTables({ market: "BR", ticker: "PETR4", assetType: "stock" });

    expect(result.tables.asset_dividends?.[0]).toMatchObject({ asset_id: PETR4_ASSET, ex_time: EX_DAY, amount: 0.5, kind: "dividend" });
    expect(result.tables.asset_splits?.[0]).toMatchObject({ ex_time: "2019-01-02", ratio: 2 });
    expect(result.tables.asset?.[0]).toMatchObject({ asset_id: PETR4_ASSET, name: COMPANY_NAME, currency: "BRL" });
  });

  it("refuses an answer of another shape, and writes nothing", async () => {
    await expect(buildAdapter("{\"unexpected\": true}").fetchTables({ market: "BR", ticker: "PETR4", assetType: "stock" })).rejects.toThrow(
      "the response format changed: yfinance sent an unknown shape for PETR4.SA; no row was written",
    );
  });

  it("keeps only the quotes and dividends of the requested period, though the library sends the whole history", async () => {
    const whole = JSON.stringify({
      quotes: [
        { date: "1999-12-31", open: 10, high: 10, low: 10, close: 10, adjClose: 9, volume: 500 },
        { date: QUOTE_DAY, open: 37.1, high: 37.5, low: 36.9, close: 37.3, adjClose: 36.2, volume: 1000 },
      ],
      dividends: [{ exDate: "1999-06-01", amount: 0.1 }, { exDate: EX_DAY, amount: 0.5 }],
      splits: [],
      currency: "BRL",
      name: COMPANY_NAME,
    });
    const result = await buildAdapter(whole).fetchTables({
      market: "BR", ticker: "PETR4", assetType: "stock", period: { from: "2024-01-01", to: "2026-12-31" },
    });

    expect(result.tables.asset_quotes).toHaveLength(1);
    expect(result.tables.asset_quotes?.[0]).toMatchObject({ reference_time_start: QUOTE_DAY });
    expect(result.tables.asset_dividends).toHaveLength(1);
    expect(result.tables.asset_dividends?.[0]).toMatchObject({ ex_time: EX_DAY });
  });

  it("names the market it does not map", () => {
    expect(() => YfinanceAdapter.buildSymbol("XX", "PETR4")).toThrow("yfinance does not map the market XX to a symbol");
  });
});
