import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuerySqlOperation } from "@/Operations/QuerySqlOperation.ts";
import { LoaderService } from "@/Services/LoaderService.ts";
import { ProviderRegistryService } from "@/Services/ProviderRegistryService.ts";
import { SqlGuardService } from "@/Services/SqlGuardService.ts";
import { StoreService } from "@/Services/StoreService.ts";
import { FakeProvider } from "@/Testing/FakeProvider.ts";

const START_MS = Date.parse("2026-11-08T12:00:00Z");
const STOCK = "stock";
const FAKE_VENDOR = "fake";
const TEMP_PREFIX = join(tmpdir(), "query-sql-test-");
const BR_MARKET = "BR";
const PETR4_TICKER = "PETR4";
const QUOTE_DATE = "2026-11-06";
const PETR4_QUOTE = {
  market: BR_MARKET,
  ticker: PETR4_TICKER,
  asset_type: STOCK,
  date: QUOTE_DATE,
  close: 31,
  source: FAKE_VENDOR,
};
const US_SQL = `SELECT close FROM quotes WHERE market = 'US' AND ticker = 'AAPL' AND asset_type = '${STOCK}'`;
const FILTER = `market = '${BR_MARKET}' AND ticker = '${PETR4_TICKER}' AND asset_type = '${STOCK}'`;
const PETR4_SQL = `SELECT ticker, close FROM quotes WHERE ${FILTER}`;

describe("QuerySqlOperation.execute()", () => {
  let directory: string;
  let store: StoreService;
  let provider: FakeProvider<"quotes">;
  let operation: QuerySqlOperation;

  beforeEach(async () => {
    directory = mkdtempSync(TEMP_PREFIX);
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    store = await StoreService.open(
      { INVESTMENT_MCP_LOG_LEVEL: "error", INVESTMENT_MCP_CACHE_DIR: directory, INVESTMENT_MCP_CACHE_TTL_SECONDS: 60 },
      () => START_MS,
    );
    provider = new FakeProvider({
      category: "quotes",
      vendor: FAKE_VENDOR,
      markets: [BR_MARKET],
      assetTypes: [STOCK],
      respond: () => Promise.resolve({ source: FAKE_VENDOR, tables: { assets: [], quotes: [PETR4_QUOTE] } }),
    });
    const registry = new ProviderRegistryService(
      { INVESTMENT_MCP_LOG_LEVEL: "error", INVESTMENT_MCP_CACHE_TTL_SECONDS: 60, INVESTMENT_MCP_QUOTES_PROVIDER: `BR:${FAKE_VENDOR}` },
      { ...ProviderRegistryService.buildEmptyCatalog(), quotes: { [FAKE_VENDOR]: provider } },
    );
    operation = new QuerySqlOperation({
      guard: new SqlGuardService(store.writer),
      loader: new LoaderService(store, registry),
      openReader: () => store.openReader(),
    });
  });

  afterEach(() => {
    store.close();
    vi.restoreAllMocks();
    rmSync(directory, { recursive: true, force: true });
  });

  describe("when a filtered query asks for an asset that is not in the store", () => {
    it("loads it, then answers with its rows and the loaded report", async () => {
      const result = await operation.execute({ sql: PETR4_SQL });

      expect(result).toMatchObject({
        isError: false,
        structuredResult: { rows: [{ ticker: PETR4_TICKER, close: 31 }], truncated: false },
      });
      expect(provider.calls).toBe(1);
    });

    it("reports the asset as loaded with its source and period", async () => {
      const result = await operation.execute({ sql: PETR4_SQL });

      expect(result.structuredResult?.loaded).toStrictEqual([{
        category: "quotes",
        market: BR_MARKET,
        ticker: PETR4_TICKER,
        status: "loaded",
        source: FAKE_VENDOR,
        isFallback: false,
        rowsWritten: 1,
        period: { from: QUOTE_DATE, to: QUOTE_DATE },
      }]);
    });
  });

  describe("when the same asset is asked again before it expires", () => {
    it("answers from the store and calls no provider", async () => {
      await operation.execute({ sql: PETR4_SQL });
      const result = await operation.execute({ sql: PETR4_SQL });

      expect(provider.calls).toBe(1);
      expect(result.structuredResult?.rows).toStrictEqual([{ ticker: PETR4_TICKER, close: 31 }]);
    });
  });

  describe("when the query has no filter", () => {
    it("refuses it with the table, the missing filter and an example, and runs nothing", async () => {
      const result = await operation.execute({ sql: "SELECT close FROM quotes" });

      expect(result.isError).toBe(true);
      expect(result.message).toContain("quotes needs a WHERE filter on market, ticker, asset_type");
      expect(result.message).toContain("Example: WHERE market = 'BR' AND ticker = 'PETR4' AND asset_type = 'stock'");
      expect(provider.calls).toBe(0);
    });
  });

  describe("when the provider cannot serve the market", () => {
    it("answers with the error and an empty answer that says the asset was not loaded", async () => {
      const result = await operation.execute({ sql: US_SQL });

      expect(result.message).toContain("no provider serves US quotes");
      expect(JSON.stringify(result.structuredResult?.loaded)).toContain("\"status\":\"failed\"");
    });
  });

  describe("when the answer is empty and an asset failed to load", () => {
    it("says the asset was not loaded and gives the cause, not that there is no data", async () => {
      const result = await operation.execute({ sql: US_SQL });

      expect(result.message.startsWith("No rows. Some assets were not loaded: No provider can serve this request: no provider serves US quotes")).toBe(true);
    });
  });

  describe("when the result is larger than the row limit", () => {
    it("cuts it to 1,024 rows and reports the 76 rows left out", async () => {
      const oneDayMs = 86_400_000;
      const firstDayMs = Date.parse("2026-01-01T00:00:00Z");
      const rows = Array.from({ length: 1100 }, (_unused, index) => ({
        market: BR_MARKET,
        ticker: PETR4_TICKER,
        asset_type: STOCK,
        date: new Date(firstDayMs + index * oneDayMs).toISOString().slice(0, 10),
        close: index,
        source: FAKE_VENDOR,
      }));
      const bigProvider = new FakeProvider({
        category: "quotes",
        vendor: FAKE_VENDOR,
        markets: [BR_MARKET],
        assetTypes: [STOCK],
        respond: () => Promise.resolve({ source: FAKE_VENDOR, tables: { quotes: rows } }),
      });
      const registry = new ProviderRegistryService(
        { INVESTMENT_MCP_LOG_LEVEL: "error", INVESTMENT_MCP_CACHE_TTL_SECONDS: 60, INVESTMENT_MCP_QUOTES_PROVIDER: `BR:${FAKE_VENDOR}` },
        { ...ProviderRegistryService.buildEmptyCatalog(), quotes: { [FAKE_VENDOR]: bigProvider } },
      );
      const bigOperation = new QuerySqlOperation({
        guard: new SqlGuardService(store.writer),
        loader: new LoaderService(store, registry),
        openReader: () => store.openReader(),
      });

      const result = await bigOperation.execute({ sql: "SELECT date, close FROM quotes WHERE market = 'BR' AND ticker = 'PETR4' AND asset_type = 'stock'" });

      expect(result.structuredResult).toMatchObject({ truncated: true, remainingRows: 76 });
      expect(result.structuredResult?.rows).toHaveLength(1024);
    });
  });
});
