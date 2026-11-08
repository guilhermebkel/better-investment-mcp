import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HttpFailureError } from "@/Errors/HttpFailureError.ts";
import { YahooAdapter } from "@/Adapters/Yahoo/YahooAdapter.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";

const FIXTURES = join(import.meta.dirname, "..", "..", "Testing", "fixtures", "yahoo");
const CHART_FIXTURE = "chart-petr4.json";
const UNKNOWN_FIXTURE = "chart-unknown.json";
const PETR4 = { market: "BR", ticker: "PETR4", assetType: "stock" };
const UNKNOWN = { market: "BR", ticker: "XXXX3", assetType: "stock" };
const NOT_FOUND_MESSAGE = "Yahoo did not find the symbol XXXX3.SA; no row was written";
const NOT_USED = "not used";

const readFixture = (name: string): string => readFileSync(join(FIXTURES, name), "utf8");

const buildHttpReturning = (text: string): {
  http: HttpPort; urls: string[];
} => {
  const urls: string[] = [];
  const http: HttpPort = {
    getText: (url: string) => {
      urls.push(url);
      return Promise.resolve(text);
    },
    getBytes: () => Promise.reject(new Error(NOT_USED)),
    postForm: () => Promise.reject(new Error(NOT_USED)),
  };
  return { http, urls };
};

const buildHttpFailing = (error: Error): HttpPort => ({
  getText: () => Promise.reject(error),
  getBytes: () => Promise.reject(error),
  postForm: () => Promise.reject(error),
});

describe("YahooAdapter.fetchTables()", () => {
  it("fills quotes, dividends, splits and the asset summary with source yahoo (AC1, AC7)", async () => {
    const { http, urls } = buildHttpReturning(readFixture(CHART_FIXTURE));
    const result = await new YahooAdapter("quotes", http, YahooAdapter.BASE_URL).fetchTables(PETR4);
    const quotes = result.tables.quotes ?? [];

    expect(urls[0]).toContain("/v8/finance/chart/PETR4.SA?");
    expect(result.source).toBe("yahoo");
    expect(result.tables.assets).toStrictEqual([{
      market: "BR", ticker: "PETR4", asset_type: "stock", legal_id: null,
      name: "Petroleo Brasileiro S.A. - Petrobras", sector: null, currency: "BRL",
    }]);
    expect(result.tables.dividends).toStrictEqual([{
      market: "BR", ticker: "PETR4", asset_type: "stock", ex_date: "2023-11-16", pay_date: null,
      amount: 0.25, kind: "dividend", source: "yahoo",
    }]);
    expect(result.tables.splits).toStrictEqual([{
      market: "BR", ticker: "PETR4", asset_type: "stock", date: "2023-11-18", ratio: 2, source: "yahoo",
    }]);
    expect(quotes).toHaveLength(6);
    expect(quotes.every((row) => row.source === "yahoo")).toBe(true);
  });

  it("flags stale and suspect rows and keeps them in the table (AC3, AC4)", async () => {
    const { http } = buildHttpReturning(readFixture(CHART_FIXTURE));
    const result = await new YahooAdapter("quotes", http).fetchTables(PETR4);
    const [, stale, suspect, afterSuspect] = result.tables.quotes ?? [];

    expect(stale).toMatchObject({ date: "2023-11-15", is_stale: true, suspect_tick: false });
    expect(suspect).toMatchObject({ date: "2023-11-16", close: 13, is_stale: false, suspect_tick: true });
    expect(afterSuspect).toMatchObject({ close: 10.2, suspect_tick: false });
  });

  it("serves the dividends category with the same tables", async () => {
    const { http } = buildHttpReturning(readFixture(CHART_FIXTURE));
    const result = await new YahooAdapter("dividends", http).fetchTables(PETR4);
    expect(Object.keys(result.tables).sort()).toStrictEqual(["assets", "dividends", "quotes", "splits"]);
  });

  it("fails with a not-found message when Yahoo answers 404 (AC2)", async () => {
    const http = buildHttpFailing(new HttpFailureError("the vendor answered with status 404", 404));
    await expect(new YahooAdapter("quotes", http).fetchTables(UNKNOWN)).rejects.toThrow(NOT_FOUND_MESSAGE);
  });

  it("fails with a not-found message when the body says the symbol is unknown (AC2)", async () => {
    const { http } = buildHttpReturning(readFixture(UNKNOWN_FIXTURE));
    await expect(new YahooAdapter("quotes", http).fetchTables(UNKNOWN)).rejects.toThrow(NOT_FOUND_MESSAGE);
  });

  it("fails with a format-changed message on an unexpected shape and writes nothing (AC5)", async () => {
    const { http } = buildHttpReturning("{\"chart\":{\"unexpected\":true}}");
    await expect(new YahooAdapter("quotes", http).fetchTables(PETR4)).rejects.toThrow("the response format changed");
  });

  it("names the rate limit when Yahoo answers 429 (AC6)", async () => {
    const http = buildHttpFailing(new HttpFailureError("the vendor answered with a rate limit (status 429)", 429));
    await expect(new YahooAdapter("quotes", http).fetchTables(PETR4)).rejects.toThrow("Yahoo answered with a rate limit");
  });

  it("refuses an asset whose market Yahoo does not map", async () => {
    const { http } = buildHttpReturning(readFixture(CHART_FIXTURE));
    const eu = { market: "EU", ticker: "SAP", assetType: "stock" };
    await expect(new YahooAdapter("quotes", http).fetchTables(eu)).rejects.toThrow("Yahoo does not map the market EU");
  });
});

describe("YahooAdapter.buildSymbol()", () => {
  it.each([
    ["BR", "PETR4", "PETR4.SA"],
    ["BR", "KNRI11", "KNRI11.SA"],
    ["US", "AAPL", "AAPL"],
  ])("maps %s:%s to %s", (market, ticker, expected) => {
    expect(YahooAdapter.buildSymbol(market, ticker)).toBe(expected);
  });
});
