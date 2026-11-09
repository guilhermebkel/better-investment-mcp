import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HttpFailureError } from "@/Errors/HttpFailureError.ts";
import { YahooAdapter } from "@/Adapters/Yahoo/YahooAdapter.ts";
import type { HeaderNameToValue, HttpPort } from "@/Protocols/HttpProtocol.ts";

const FIXTURES = join(import.meta.dirname, "..", "..", "Testing", "fixtures", "yahoo");
const CHART_FIXTURE = "chart-petr4.json";
const UNKNOWN_FIXTURE = "chart-unknown.json";
const PETR4 = { market: "BR", ticker: "PETR4", assetType: "stock" };
const PETR4_ASSET = "BR:stock:PETR4";
const UNKNOWN = { market: "BR", ticker: "XXXX3", assetType: "stock" };
const NOT_FOUND_MESSAGE = "Yahoo did not find the symbol XXXX3.SA; no row was written";
const NOT_USED = "not used";

const readFixture = (name: string): string => readFileSync(join(FIXTURES, name), "utf8");

const CRUMB = "CRUMB1";
const SESSION_COOKIE = "A3=abc";

type YahooCall = {
  url: string;
  headers: HeaderNameToValue | undefined;
};

type YahooFake = {
  http: HttpPort;
  charts: YahooCall[];
  counts: {
    cookies: number;
    crumbs: number;
  };
};

const buildYahooHttp = (chart: (callNumber: number) => Promise<string>, urls: string[] = []): YahooFake => {
  const charts: YahooCall[] = [];
  const counts = { cookies: 0, crumbs: 0 };
  const http: HttpPort = {
    // Why: the crumb endpoint is not a chart call, so its answer is kept out of the chart calls.
    getText: (url: string, _encoding?: string, headers?: HeaderNameToValue) => {
      if (url.includes("/v1/test/getcrumb")) {
        counts.crumbs += 1;
        return Promise.resolve(`${CRUMB}\n`);
      }
      charts.push({ url, headers });
      urls.push(url);
      return chart(charts.length);
    },
    getBytes: () => Promise.reject(new Error(NOT_USED)),
    postForm: () => Promise.reject(new Error(NOT_USED)),
    downloadToFile: () => Promise.reject(new Error("not used")),
    getCookies: () => {
      counts.cookies += 1;
      return Promise.resolve([`${SESSION_COOKIE}; Path=/; Domain=yahoo.com`]);
    },
  };
  return { http, charts, counts };
};

const buildHttpReturning = (text: string): {
  http: HttpPort; urls: string[];
} => {
  const urls: string[] = [];
  const { http } = buildYahooHttp(() => Promise.resolve(text), urls);
  return { http, urls };
};

const buildHttpFailing = (error: Error): HttpPort => ({
  getText: () => Promise.reject(error),
  getBytes: () => Promise.reject(error),
  postForm: () => Promise.reject(error),
  downloadToFile: () => Promise.reject(new Error("not used")),
  getCookies: () => Promise.reject(error),
});

describe("YahooAdapter.fetchTables()", () => {
  it("fills quotes, dividends, splits and the asset summary (AC1, AC7)", async () => {
    const { http, urls } = buildHttpReturning(readFixture(CHART_FIXTURE));
    const result = await new YahooAdapter("quotes", http, YahooAdapter.BASE_URL).fetchTables(PETR4);
    const quotes = result.tables.asset_quotes ?? [];

    expect(urls[0]).toContain("/v8/finance/chart/PETR4.SA?");
    expect(result.source).toBe("yahoo");
    expect(result.tables.asset).toStrictEqual([{
      asset_id: PETR4_ASSET, market: "BR", asset_type: "stock", code: "PETR4",
      name: "Petroleo Brasileiro S.A. - Petrobras", currency: "BRL",
    }]);
    expect(result.tables.asset_dividends).toStrictEqual([{
      asset_id: PETR4_ASSET, ex_time: "2023-11-16", payment_time: null, kind: "dividend", amount: 0.25,
    }]);
    expect(result.tables.asset_splits).toStrictEqual([{
      asset_id: PETR4_ASSET, ex_time: "2023-11-18", ratio: 2,
    }]);
    expect(quotes).toHaveLength(6);
    expect(quotes.every((row) => row.asset_id === PETR4_ASSET)).toBe(true);
  });

  it("flags stale and suspect rows and keeps them in the table (AC3, AC4)", async () => {
    const { http } = buildHttpReturning(readFixture(CHART_FIXTURE));
    const result = await new YahooAdapter("quotes", http).fetchTables(PETR4);
    const [, stale, suspect, afterSuspect] = result.tables.asset_quotes ?? [];

    expect(stale).toMatchObject({ reference_time_start: "2023-11-15", is_stale: true, suspect_tick: false });
    expect(suspect).toMatchObject({ reference_time_start: "2023-11-16", close: 13, is_stale: false, suspect_tick: true });
    expect(afterSuspect).toMatchObject({ close: 10.2, suspect_tick: false });
  });

  it("serves the dividends category with the same tables", async () => {
    const { http } = buildHttpReturning(readFixture(CHART_FIXTURE));
    const result = await new YahooAdapter("dividends", http).fetchTables(PETR4);
    expect(Object.keys(result.tables).sort()).toStrictEqual(["asset", "asset_dividends", "asset_quotes", "asset_splits"]);
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

  it("requests the cookie and crumb once and reuses them for the next load (AC8)", async () => {
    const { http, counts, charts } = buildYahooHttp(() => Promise.resolve(readFixture(CHART_FIXTURE)));
    const adapter = new YahooAdapter("quotes", http, YahooAdapter.BASE_URL);
    await adapter.fetchTables(PETR4);
    await adapter.fetchTables(PETR4);

    expect(counts).toStrictEqual({ cookies: 1, crumbs: 1 });
    expect(charts).toHaveLength(2);
    expect(charts.every((call) => call.url.includes(`crumb=${CRUMB}`))).toBe(true);
  });

  it("sends the cookie with the crumb and the adapter headers with the chart (AC8)", async () => {
    const { http, charts } = buildYahooHttp(() => Promise.resolve(readFixture(CHART_FIXTURE)));
    await new YahooAdapter("quotes", http, YahooAdapter.BASE_URL).fetchTables(PETR4);

    expect(charts[0]?.headers).toStrictEqual({ ...YahooAdapter.HEADERS, Cookie: SESSION_COOKIE });
  });

  it("renews an expired crumb once, then loads (AC8)", async () => {
    const { http, counts } = buildYahooHttp((callNumber) => (callNumber === 1
      ? Promise.reject(new HttpFailureError("the vendor answered with status 401", 401))
      : Promise.resolve(readFixture(CHART_FIXTURE))));
    const result = await new YahooAdapter("quotes", http, YahooAdapter.BASE_URL).fetchTables(PETR4);

    expect(counts.crumbs).toBe(2);
    expect(result.tables.asset_quotes).toHaveLength(6);
  });

  it("stops the load when the renewed crumb is refused too, and writes nothing (AC8)", async () => {
    const { http, counts } = buildYahooHttp(() => Promise.reject(new HttpFailureError("the vendor answered with status 401", 401)));
    await expect(new YahooAdapter("quotes", http, YahooAdapter.BASE_URL).fetchTables(PETR4))
      .rejects.toThrow("status 401");
    expect(counts.crumbs).toBe(2);
  });

  it("fails with a format-changed message when Yahoo sends no usable crumb (AC5)", async () => {
    const http: HttpPort = {
      ...buildYahooHttp(() => Promise.resolve("")).http,
      getText: () => Promise.resolve("<html>blocked</html>"),
    };
    await expect(new YahooAdapter("quotes", http, YahooAdapter.BASE_URL).fetchTables(PETR4))
      .rejects.toThrow("Yahoo did not send a crumb");
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
