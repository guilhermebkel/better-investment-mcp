import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Requirement } from "@/Protocols/SqlGuardProtocol.ts";
import { SqlGuardService } from "@/Services/SqlGuardService.ts";
import { StoreService } from "@/Services/StoreService.ts";

const TEMP_PREFIX = join(tmpdir(), "sql-guard-test-");
const SEPTEMBER_2024 = "2024-09-30";
const ONLY_SELECT = "Only a SELECT statement runs";
const QUOTES_NEEDS_TICKER = "quotes needs a WHERE filter on ticker";

const ACCEPTED: [string, string, Requirement[]][] = [
  ["a single asset with =", "SELECT close FROM quotes WHERE market = 'BR' AND ticker = 'PETR4' AND asset_type = 'stock'", [
    { table: "quotes", category: "quotes", market: "BR", ticker: "PETR4", assetType: "stock" },
  ]],
  ["an IN list gives one requirement per value", "SELECT close FROM quotes WHERE market = 'BR' AND ticker IN ('PETR4', 'VALE3') AND asset_type = 'stock'", [
    { table: "quotes", category: "quotes", market: "BR", ticker: "PETR4", assetType: "stock" },
    { table: "quotes", category: "quotes", market: "BR", ticker: "VALE3", assetType: "stock" },
  ]],
  ["an aggregation with GROUP BY", "SELECT avg(close) FROM quotes WHERE market = 'BR' AND ticker = 'PETR4' AND asset_type = 'stock' GROUP BY ticker", [
    { table: "quotes", category: "quotes", market: "BR", ticker: "PETR4", assetType: "stock" },
  ]],
  ["a join where both sides are filtered", "SELECT q.close, d.amount FROM quotes q JOIN dividends d ON d.market = q.market AND d.ticker = q.ticker AND d.asset_type = q.asset_type "
  + "WHERE q.market = 'BR' AND q.ticker = 'PETR4' AND q.asset_type = 'stock' AND d.market = 'BR' AND d.ticker = 'PETR4' AND d.asset_type = 'stock'", [
    { table: "quotes", category: "quotes", market: "BR", ticker: "PETR4", assetType: "stock" },
    { table: "dividends", category: "dividends", market: "BR", ticker: "PETR4", assetType: "stock" },
  ]],
  ["a self join of two assets", "SELECT a.close, b.close FROM quotes a JOIN quotes b ON a.date = b.date "
  + "WHERE a.market = 'BR' AND a.ticker = 'PETR4' AND a.asset_type = 'stock' AND b.market = 'BR' AND b.ticker = 'VALE3' AND b.asset_type = 'stock'", [
    { table: "quotes", category: "quotes", market: "BR", ticker: "PETR4", assetType: "stock" },
    { table: "quotes", category: "quotes", market: "BR", ticker: "VALE3", assetType: "stock" },
  ]],
  ["a CTE whose body is filtered", "WITH c AS (SELECT close FROM quotes WHERE market = 'BR' AND ticker = 'VALE3' AND asset_type = 'stock') SELECT avg(close) FROM c", [
    { table: "quotes", category: "quotes", market: "BR", ticker: "VALE3", assetType: "stock" },
  ]],
  ["a window function", "SELECT ticker, close, avg(close) OVER (ORDER BY date ROWS 5 PRECEDING) FROM quotes WHERE market = 'BR' AND ticker = 'PETR4' AND asset_type = 'stock'", [
    { table: "quotes", category: "quotes", market: "BR", ticker: "PETR4", assetType: "stock" },
  ]],
  ["financial_statements with a BETWEEN period", "SELECT line_item, value FROM financial_statements WHERE market = 'BR' AND ticker = 'PETR4' AND asset_type = 'stock' AND period_end BETWEEN '2024-01-01' AND '2024-12-31'", [
    { table: "financial_statements", category: "statements", market: "BR", ticker: "PETR4", assetType: "stock", period: { from: "2024-01-01", to: "2024-12-31" } },
  ]],
  ["financial_statements with a >= bound given as a DATE literal", "SELECT value FROM financial_statements WHERE market = 'BR' AND ticker = 'PETR4' AND asset_type = 'stock' AND period_end >= DATE '2024-07-01'", [
    { table: "financial_statements", category: "statements", market: "BR", ticker: "PETR4", assetType: "stock", period: { from: "2024-07-01" } },
  ]],
  ["a period bound with the column on the right", "SELECT value FROM financial_statements WHERE market = 'BR' AND ticker = 'PETR4' AND asset_type = 'stock' AND '2024-06-30' >= period_end", [
    { table: "financial_statements", category: "statements", market: "BR", ticker: "PETR4", assetType: "stock", period: { to: "2024-06-30" } },
  ]],
  ["a period equal to one date", "SELECT value FROM financial_statements WHERE market = 'BR' AND ticker = 'PETR4' AND asset_type = 'stock' AND period_end = '2024-09-30'", [
    { table: "financial_statements", category: "statements", market: "BR", ticker: "PETR4", assetType: "stock", period: { from: SEPTEMBER_2024, to: SEPTEMBER_2024 } },
  ]],
  ["a period IN list of dates gives the window of the list", "SELECT value FROM financial_statements WHERE market = 'BR' AND ticker = 'PETR4' AND asset_type = 'stock' AND period_end IN ('2024-09-30', '2024-03-31')", [
    { table: "financial_statements", category: "statements", market: "BR", ticker: "PETR4", assetType: "stock", period: { from: "2024-03-31", to: "2024-09-30" } },
  ]],
  ["two bounds on one column keep the narrowest", "SELECT value FROM financial_statements WHERE market = 'BR' AND ticker = 'PETR4' AND asset_type = 'stock' AND period_end >= '2023-01-01' AND period_end >= '2024-01-01' AND period_end <= '2025-12-31' AND period_end <= '2024-12-31'", [
    { table: "financial_statements", category: "statements", market: "BR", ticker: "PETR4", assetType: "stock", period: { from: "2024-01-01", to: "2024-12-31" } },
  ]],
  ["a period inside an OR is not read as a bound", "SELECT value FROM financial_statements WHERE market = 'BR' AND ticker = 'PETR4' AND asset_type = 'stock' AND (period_end = '2024-03-31' OR period_end = '2024-06-30')", [
    { table: "financial_statements", category: "statements", market: "BR", ticker: "PETR4", assetType: "stock", period: {} },
  ]],
  ["a period that is not a date is not read as a bound", "SELECT value FROM financial_statements WHERE market = 'BR' AND ticker = 'PETR4' AND asset_type = 'stock' AND period_end >= 'abc'", [
    { table: "financial_statements", category: "statements", market: "BR", ticker: "PETR4", assetType: "stock", period: {} },
  ]],
  ["fii_monthly with a month range", "SELECT net_worth FROM fii_monthly WHERE market = 'BR' AND ticker = 'IRDM11' AND asset_type = 'fii' AND period >= '2025-01-01' AND period <= '2025-06-30'", [
    { table: "fii_monthly", category: "fund_data", market: "BR", ticker: "IRDM11", assetType: "fii", period: { from: "2025-01-01", to: "2025-06-30" } },
  ]],
  ["filings by the reference date", "SELECT filing_type FROM filings WHERE market = 'BR' AND ticker = 'IRDM11' AND asset_type = 'fii' AND reference_date = '2025-10-31'", [
    { table: "filings", category: "filings", market: "BR", ticker: "IRDM11", assetType: "fii", period: { from: "2025-10-31", to: "2025-10-31" } },
  ]],
  ["a catalog table without filters", "SELECT name FROM assets", []],
  ["asset_coverage without filters", "SELECT * FROM asset_coverage", []],
  ["macro_series with its series", "SELECT value FROM macro_series WHERE series = 'SELIC'", [
    { table: "macro_series", category: "macro", market: "SERIES", ticker: "SELIC" },
  ]],
  ["treasury_prices with two bond families", "SELECT buy_rate FROM treasury_prices WHERE bond_type IN ('Tesouro Selic', 'Tesouro IPCA+')", [
    { table: "treasury_prices", category: "treasury", market: "TDIR", ticker: "Tesouro Selic" },
    { table: "treasury_prices", category: "treasury", market: "TDIR", ticker: "Tesouro IPCA+" },
  ]],
  ["market_expectations with one indicator", "SELECT median_value FROM market_expectations WHERE indicator = 'ipca'", [
    { table: "market_expectations", category: "expectations", market: "FOCUS", ticker: "ipca" },
  ]],
  ["chunks with filing_type", "SELECT text FROM chunks WHERE market = 'BR' AND ticker = 'PETR4' AND asset_type = 'stock' AND filing_type = 'ITR'", [
    { table: "chunks", category: "documents", market: "BR", ticker: "PETR4", assetType: "stock", filingType: "ITR" },
  ]],
  ["chunks with filing_id", "SELECT text FROM chunks WHERE market = 'BR' AND ticker = 'PETR4' AND asset_type = 'stock' AND filing_id = 'abc'", [
    { table: "chunks", category: "documents", market: "BR", ticker: "PETR4", assetType: "stock", filingId: "abc" },
  ]],
  ["search_chunks with its six arguments", "SELECT text FROM search_chunks('lucro líquido', 'BR', 'PETR4', 'stock', 'material_fact', NULL)", [
    { table: "chunks", category: "documents", market: "BR", ticker: "PETR4", assetType: "stock", filingType: "material_fact" },
  ]],
  ["FII monthly data", "SELECT net_worth FROM fii_monthly WHERE market = 'BR' AND ticker = 'KNRI11' AND asset_type = 'fii'", [
    { table: "fii_monthly", category: "fund_data", market: "BR", ticker: "KNRI11", assetType: "fii", period: {} },
  ]],
  ["a UNION of two filtered selects", "SELECT close FROM quotes WHERE market = 'BR' AND ticker = 'PETR4' AND asset_type = 'stock' "
  + "UNION ALL SELECT close FROM quotes WHERE market = 'BR' AND ticker = 'VALE3' AND asset_type = 'stock'", [
    { table: "quotes", category: "quotes", market: "BR", ticker: "PETR4", assetType: "stock" },
    { table: "quotes", category: "quotes", market: "BR", ticker: "VALE3", assetType: "stock" },
  ]],
  ["an IN list over two markets", "SELECT close FROM quotes WHERE market IN ('BR', 'US') AND ticker = 'AAPL' AND asset_type = 'stock'", [
    { table: "quotes", category: "quotes", market: "BR", ticker: "AAPL", assetType: "stock" },
    { table: "quotes", category: "quotes", market: "US", ticker: "AAPL", assetType: "stock" },
  ]],
  ["a literal on the left of =", "SELECT close FROM quotes WHERE 'BR' = market AND 'PETR4' = ticker AND 'stock' = asset_type", [
    { table: "quotes", category: "quotes", market: "BR", ticker: "PETR4", assetType: "stock" },
  ]],
  ["an OR whose branches both name the ticker", "SELECT close FROM quotes WHERE market = 'BR' AND asset_type = 'stock' AND (ticker = 'PETR4' OR ticker = 'VALE3')", [
    { table: "quotes", category: "quotes", market: "BR", ticker: "PETR4", assetType: "stock" },
    { table: "quotes", category: "quotes", market: "BR", ticker: "VALE3", assetType: "stock" },
  ]],
];

const REFUSED: [string, string, string][] = [
  ["a period that starts after it ends", "SELECT value FROM financial_statements WHERE market = 'BR' AND ticker = 'PETR4' AND asset_type = 'stock' AND period_end >= '2025-01-01' AND period_end <= '2024-01-01'", "starts after it ends"],
  ["no filter at all", "SELECT close FROM quotes", "quotes needs a WHERE filter on market, ticker, asset_type"],
  ["asset_type missing", "SELECT close FROM quotes WHERE market = 'BR' AND ticker = 'PETR4'", "quotes needs a WHERE filter on asset_type"],
  ["a join with one side filtered", "SELECT q.close FROM quotes q JOIN dividends d ON d.ticker = q.ticker "
  + "WHERE q.market = 'BR' AND q.ticker = 'PETR4' AND q.asset_type = 'stock'", "dividends (as d) needs a WHERE filter on market, ticker, asset_type"],
  ["chunks without filing_type or filing_id", "SELECT text FROM chunks WHERE market = 'BR' AND ticker = 'PETR4' AND asset_type = 'stock'", "chunks needs a WHERE filter on filing_type or filing_id"],
  ["macro_series without series", "SELECT value FROM macro_series", "macro_series needs a WHERE filter on series"],
  ["treasury_prices without bond_type", "SELECT buy_rate FROM treasury_prices", "treasury_prices needs a WHERE filter on bond_type"],
  ["market_expectations without indicator", "SELECT median_value FROM market_expectations", "market_expectations needs a WHERE filter on indicator"],
  ["two statements", "SELECT 1; SELECT 2", "Send exactly one SELECT statement per query"],
  ["PRAGMA", "PRAGMA version", ONLY_SELECT],
  ["COPY", "COPY quotes TO 'out.csv'", ONLY_SELECT],
  ["ATTACH", "ATTACH 'other.duckdb' AS other", ONLY_SELECT],
  ["a function over the ticker", "SELECT close FROM quotes WHERE lower(ticker) = 'petr4' AND market = 'BR' AND asset_type = 'stock'", QUOTES_NEEDS_TICKER],
  ["a ticker taken from a subquery", "SELECT close FROM quotes WHERE market = 'BR' AND ticker = (SELECT 'PETR4') AND asset_type = 'stock'", QUOTES_NEEDS_TICKER],
  ["an OR that hides the ticker", "SELECT close FROM quotes WHERE market = 'BR' AND asset_type = 'stock' AND (ticker = 'PETR4' OR close > 10)", QUOTES_NEEDS_TICKER],
  ["document_text", "SELECT text FROM document_text", "document_text has no market, ticker or asset_type column"],
  ["search_chunks without a ticker", "SELECT * FROM search_chunks('lucro', 'BR', NULL, 'stock', 'material_fact', NULL)", "needs a WHERE filter on ticker"],
  ["search_chunks with a column as the query", "SELECT * FROM search_chunks(text, 'BR', 'PETR4', 'stock', 'material_fact', NULL)", "needs the query text as a literal string"],
  ["a table function", "SELECT * FROM read_text('/etc/hosts')", "read_text(...) is not available in query_sql yet"],
  ["search_chunks with four arguments", "SELECT * FROM search_chunks('lucro', 'PETR4', 'itr', NULL)", "search_chunks takes 6 arguments"],
  ["a CTE named like a data table", "WITH quotes AS (SELECT 1 AS close) SELECT * FROM quotes", "A WITH name cannot be the name of a data table: rename quotes"],
  ["a syntax error", "SELEC 1", "The query has a syntax error"],
];

describe("SqlGuardService.checkSql()", () => {
  let directory: string;
  let store: StoreService | undefined;
  let guard: SqlGuardService;

  beforeEach(async () => {
    directory = mkdtempSync(TEMP_PREFIX);
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    store = await StoreService.open({ INVESTMENT_MCP_LOG_LEVEL: "error", INVESTMENT_MCP_CACHE_DIR: directory, INVESTMENT_MCP_CACHE_TTL_SECONDS: 60 });
    guard = new SqlGuardService(store.writer);
  });

  afterEach(() => {
    store?.close();
    store = undefined;
    vi.restoreAllMocks();
    rmSync(directory, { recursive: true, force: true });
  });

  describe("when the query is accepted", () => {
    it.each(ACCEPTED)("accepts %s with its requirements", async (_name, sql, requirements) => {
      const verdict = await guard.checkSql(sql);

      expect(verdict).toStrictEqual({ isAccepted: true, requirements });
    });
  });

  describe("when the query is refused", () => {
    it.each(REFUSED)("refuses %s and says why", async (_name, sql, fragment) => {
      const verdict = await guard.checkSql(sql);

      expect(verdict.isAccepted).toBe(false);
      expect(JSON.stringify(verdict)).toContain(fragment);
    });
  });
});
