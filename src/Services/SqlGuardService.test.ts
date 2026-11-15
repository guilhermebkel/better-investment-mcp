import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Requirement } from "@/Protocols/SqlGuardProtocol.ts";
import { SqlGuardService } from "@/Services/SqlGuardService.ts";
import { StoreService } from "@/Services/StoreService.ts";

const TEMP_PREFIX = join(tmpdir(), "sql-guard-test-");
const ONLY_SELECT = "Only a SELECT statement runs";
const NEEDS_ASSET_ID = "needs a WHERE filter on asset_id";
const PETR4 = { market: "BR", ticker: "PETR4", assetType: "stock" } as const;
const VALE3 = { market: "BR", ticker: "VALE3", assetType: "stock" } as const;

const ACCEPTED: [string, string, Requirement[]][] = [
  ["a filing type of a disclosure (FRE) is listed by the disclosures category (AC2)", "SELECT filing_id FROM asset_filings WHERE asset_id = 'BR:stock:PETR4' AND document_type = 'fre'", [
    { table: "asset_filings", category: "disclosures", ...PETR4, period: {} },
  ]],
  ["a filing type that is not a disclosure is listed by the filings category", "SELECT filing_id FROM asset_filings WHERE asset_id = 'BR:stock:PETR4' AND document_type = 'material_fact'", [
    { table: "asset_filings", category: "filings", ...PETR4, period: {} },
  ]],
  ["two kinds of filing type load both lists", "SELECT filing_id FROM asset_filings WHERE asset_id = 'BR:stock:PETR4' AND document_type IN ('fre', 'material_fact')", [
    { table: "asset_filings", category: "filings", ...PETR4, period: {} },
    { table: "asset_filings", category: "disclosures", ...PETR4, period: {} },
  ]],
  ["a single asset with =", "SELECT close FROM asset_quotes WHERE asset_id = 'BR:stock:PETR4'", [
    { table: "asset_quotes", category: "quotes", ...PETR4, period: {} },
  ]],
  ["an IN list gives one requirement per asset", "SELECT close FROM asset_quotes WHERE asset_id IN ('BR:stock:PETR4', 'BR:stock:VALE3')", [
    { table: "asset_quotes", category: "quotes", ...PETR4, period: {} },
    { table: "asset_quotes", category: "quotes", ...VALE3, period: {} },
  ]],
  ["an aggregation with GROUP BY", "SELECT avg(close) FROM asset_quotes WHERE asset_id = 'BR:stock:PETR4' GROUP BY asset_id", [
    { table: "asset_quotes", category: "quotes", ...PETR4, period: {} },
  ]],
  ["a join from asset to its quotes, each side filtered by asset_id", "SELECT q.close FROM asset a JOIN asset_quotes q USING (asset_id) WHERE a.asset_id = 'BR:stock:PETR4' AND q.asset_id = 'BR:stock:PETR4'", [
    { table: "asset", category: "registry", ...PETR4 },
    { table: "asset_quotes", category: "quotes", ...PETR4, period: {} },
  ]],
  ["a metric of a statement loads the statements category", "SELECT value FROM asset_metrics WHERE asset_id = 'BR:stock:PETR4' AND metric = 'statement.dre_con.3_01'", [
    { table: "asset_metrics", category: "statements", ...PETR4, period: {} },
  ]],
  ["metrics of two groups load two categories", "SELECT value FROM asset_metrics WHERE asset_id = 'BR:stock:PETR4' AND metric IN ('fundamental.roe', 'statement.dre_con.3_01')", [
    { table: "asset_metrics", category: "fundamentals", ...PETR4, period: {} },
    { table: "asset_metrics", category: "statements", ...PETR4, period: {} },
  ]],
  ["a macro index with its metric", "SELECT value FROM asset_metrics WHERE asset_id = 'BR:index:IPCA' AND metric = 'macro.value'", [
    { table: "asset_metrics", category: "macro", market: "BR", ticker: "IPCA", assetType: "index", period: {} },
  ]],
  ["a document list by its document type", "SELECT filing_id FROM asset_filings WHERE asset_id = 'BR:stock:PETR4'", [
    { table: "asset_filings", category: "filings", ...PETR4, period: {} },
  ]],
  ["a period on quotes, with its bounds", "SELECT close FROM asset_quotes WHERE asset_id = 'BR:stock:PETR4' AND reference_time_start BETWEEN '2024-01-01' AND '2024-06-30'", [
    { table: "asset_quotes", category: "quotes", ...PETR4, period: { from: "2024-01-01", to: "2024-06-30" } },
  ]],
  ["a catalog table without filters", "SELECT name FROM load_runs", []],
  ["the coverage view without filters", "SELECT * FROM asset_coverage", []],
];

const REFUSED: [string, string, string][] = [
  ["two statements", "SELECT 1; SELECT 2", "Send exactly one SELECT statement per query"],
  ["PRAGMA", "PRAGMA version", ONLY_SELECT],
  ["COPY", "COPY asset_quotes TO 'out.csv'", ONLY_SELECT],
  ["ATTACH", "ATTACH 'other.duckdb' AS other", ONLY_SELECT],
  ["no filter at all", "SELECT close FROM asset_quotes", "asset_quotes " + NEEDS_ASSET_ID],
  ["a filter on sector instead of asset_id", "SELECT close FROM asset a JOIN asset_quotes q USING (asset_id) WHERE a.sector = 'Energia'", "asset_quotes (as q) needs a WHERE filter on asset_id"],
  ["a LIKE on asset_id", "SELECT close FROM asset_quotes WHERE asset_id LIKE 'BR:stock:%'", "asset_quotes " + NEEDS_ASSET_ID],
  ["an asset_id in the old form", "SELECT close FROM asset_quotes WHERE asset_id = 'PETR4'", "asset_id PETR4 is not market:asset_type:code"],
  ["a metric with an unknown group", "SELECT value FROM asset_metrics WHERE asset_id = 'BR:stock:PETR4' AND metric = 'foo.bar'", "metric group foo is not known"],
  ["metrics without a metric filter", "SELECT value FROM asset_metrics WHERE asset_id = 'BR:stock:PETR4'", "asset_metrics needs a WHERE filter on metric"],
  ["a join where one side has no asset_id", "SELECT q.close, d.ex_time FROM asset_quotes q JOIN asset_dividends d ON d.kind = q.asset_id WHERE q.asset_id = 'BR:stock:PETR4'", "asset_dividends (as d) needs a WHERE filter on asset_id"],
  ["chunks without document_type or filing_id", "SELECT text FROM asset_filing_chunks WHERE asset_id = 'BR:stock:PETR4'", "asset_filing_chunks needs a WHERE filter on document_type or filing_id"],
  ["a search mode that is not built yet", "SELECT text FROM search_chunks('lucro', 'BR:stock:PETR4', 'material_fact', NULL, 'semantic')", "search_chunks mode semantic is not available; the modes are text."],
  ["a search without its mode argument", "SELECT text FROM search_chunks('lucro', 'BR:stock:PETR4', 'material_fact', NULL)", "search_chunks takes 5 arguments"],
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

    it.each(REFUSED)("refuses %s and names the guide topic sql (AC2)", async (_name, sql) => {
      const verdict = await guard.checkSql(sql);

      expect(JSON.stringify(verdict)).toContain("topic \\\"sql\\\"");
    });
  });
});
