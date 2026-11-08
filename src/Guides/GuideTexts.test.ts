import { describe, expect, it } from "vitest";
import { DuckDbAdapter } from "@/Adapters/DuckDb/DuckDbAdapter.ts";
import { DuckDbSchemaAdapter } from "@/Adapters/DuckDb/DuckDbSchemaAdapter.ts";
import type { DatabasePort } from "@/Protocols/DatabaseProtocol.ts";
import { GuideTexts } from "@/Guides/GuideTexts.ts";
import { GUIDE_TOPICS } from "@/Schemas/GetGuideSchema.ts";
import { SqlGuardService } from "@/Services/SqlGuardService.ts";

const EXAMPLE_PATTERN = /```sql\n([\s\S]*?)\n```/gu;

const readExamples = (topic: string): string[] => {
  const text = GuideTexts.topicToText[topic as keyof typeof GuideTexts.topicToText];
  return [...text.matchAll(EXAMPLE_PATTERN)].map((match) => match[1] ?? "");
};

const seedDatabase = async (database: DatabasePort): Promise<void> => {
  // Why: the examples run against a store with one fixture row per table they read, so a guide cannot teach a query that fails on the real schema.
  await database.run("INSERT INTO assets (market, ticker, asset_type, legal_id, name, sector, currency) VALUES ('BR', 'PETR4', 'stock', NULL, 'Petrobras', NULL, 'BRL')");
  await database.run("INSERT INTO quotes (market, ticker, asset_type, date, open, high, low, close, adj_close, volume, is_stale, suspect_tick, source) VALUES ('BR', 'PETR4', 'stock', DATE '2024-01-02', 1, 1, 1, 1, 1, 1, false, false, 'yahoo')");
  await database.run("INSERT INTO dividends (market, ticker, asset_type, ex_date, pay_date, amount, kind, source) VALUES ('BR', 'KNRI11', 'fii', DATE '2024-01-15', NULL, 0.9, 'dividend', 'yahoo')");
  await database.run("INSERT INTO fundamentals (market, ticker, asset_type, year, metric, value, source) VALUES ('BR', 'PETR4', 'stock', 2024, 'net_revenue', 300.5, 'statusinvest')");
  await database.run("INSERT INTO fii_monthly (market, ticker, asset_type, period, distribution_per_unit, total_revenue, source) VALUES ('BR', 'KNRI11', 'fii', DATE '2024-01-01', 1.0, 11, 'statusinvest')");
  await database.run("INSERT INTO filings (filing_id, market, ticker, asset_type, filing_type, category, delivered_at, subject, url, file_hash, source) VALUES ('f1', 'BR', 'PETR4', 'stock', 'other', 'Assembleia', TIMESTAMPTZ '2024-03-22 00:00:00-03', 'Ata', 'https://example.org', NULL, 'cvm')");
  await database.run("INSERT INTO chunks (filing_id, market, ticker, asset_type, filing_type, section, page, seq, text) VALUES ('f1', 'BR', 'KNRI11', 'fii', 'other', 'Dividendos', 1, 1, 'Pagamento de dividendos')");
  await database.run("INSERT INTO macro_series (series, date, value, source) VALUES ('ipca', DATE '2025-01-01', 0.16, 'bcb')");
};

describe("GuideTexts.topicToText()", () => {
  it.each(GUIDE_TOPICS)("keeps the %s guide within the size limit (AC5)", (topic) => {
    expect(GuideTexts.topicToText[topic].length).toBeLessThanOrEqual(GuideTexts.MAX_CHARS);
  });

  it("contains at least one example in the sql and search topics", () => {
    expect(readExamples("sql").length).toBeGreaterThan(0);
    expect(readExamples("search").length).toBeGreaterThan(0);
  });

  it.each(GUIDE_TOPICS)("has examples that the SQL guard accepts and the store runs, in %s (AC3)", async (topic) => {
    const database = await DuckDbAdapter.openWriter(":memory:");
    await DuckDbSchemaAdapter.createSchema(database);
    await seedDatabase(database);
    const guard = new SqlGuardService(database);
    for (const sql of readExamples(topic)) {
      const verdict = await guard.checkSql(sql);
      expect(verdict.isAccepted).toBe(true);
      const rows = await database.readRows(sql);
      expect(Array.isArray(rows)).toBe(true);
    }
    database.close();
  });
});
