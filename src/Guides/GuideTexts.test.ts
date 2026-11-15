import { FullTextIndexService } from "@/Services/FullTextIndexService.ts";
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
  await database.run("INSERT INTO asset (asset_id, market, asset_type, code, name) VALUES ('BR:stock:PETR4', 'BR', 'stock', 'PETR4', 'Petrobras')");
  await database.run("INSERT INTO asset_quotes (asset_id, reference_time_start, reference_time_end, open, high, low, close, adj_close, volume, is_stale, suspect_tick) VALUES ('BR:stock:PETR4', DATE '2024-01-02', DATE '2024-01-02', 1, 1, 1, 1, 1, 1, false, false)");
  await database.run("INSERT INTO asset_dividends (asset_id, ex_time, payment_time, kind, amount) VALUES ('BR:fii:KNRI11', DATE '2024-01-15', NULL, 'dividend', 0.9)");
  await database.run(`INSERT INTO asset_metrics (asset_id, metric, reference_time_start, reference_time_end, value, unit) VALUES
    ('BR:stock:PETR4', 'fundamental.roe', DATE '2024-01-01', DATE '2024-12-31', 0.12, 'as_published'),
    ('BR:stock:PETR4', 'statement.dre_con.3_01', DATE '2024-07-01', DATE '2024-09-30', 300.5, 'brl'),
    ('BR:fii:KNRI11', 'fii.net_worth', DATE '2025-01-01', DATE '2025-01-31', 1000000, 'brl'),
    ('BR:index:IPCA', 'macro.value', DATE '2025-01-01', DATE '2025-01-31', 0.16, 'percent_per_month'),
    ('BR:treasury:SELIC_2029-03-01', 'treasury.buy_rate', DATE '2026-11-06', DATE '2026-11-06', 0.02, 'percent_per_year'),
    ('BR:treasury:SELIC_2029-03-01', 'treasury.base_unit_price', DATE '2026-11-06', DATE '2026-11-06', 14000.5, 'brl'),
    ('BR:currency:USD', 'fx.buy_rate', DATE '2026-01-02', DATE '2026-01-02', 5.5, 'brl_per_currency'),
    ('BR:currency:USD', 'fx.sell_rate', DATE '2026-01-02', DATE '2026-01-02', 5.6, 'brl_per_currency'),
    ('BR:fund:00.017.024/0001-53', 'fund.quota', DATE '2026-11-06', DATE '2026-11-06', 10.2, 'brl_per_quota')`);
  await database.run("INSERT INTO asset_expectations (asset_id, reference_time_start, reference_time_end, survey_time, calculation_base, mean, median, std_dev, min, max, respondents) VALUES ('BR:index:IPCA', DATE '2027-01-01', DATE '2027-12-31', DATE '2025-01-03', 0, 4.1, 4.0, 0.3, 3.5, 4.8, 40)");
  await database.run("INSERT INTO asset_filings (filing_id, asset_id, document_type, category, subject, reference_time_start, reference_time_end, published_at, version, url, file_hash) VALUES ('f1', 'BR:stock:PETR4', 'material_fact', 'Fato Relevante', 'Ata', DATE '2024-03-22', DATE '2024-03-22', TIMESTAMPTZ '2024-03-22 00:00:00-03', 1, 'https://www.rad.cvm.gov.br/ENET/f1', NULL)");
  await database.run("INSERT INTO asset_filing_chunks (filing_id, asset_id, document_type, section, item, page, seq, text) VALUES ('f1', 'BR:stock:PETR4', 'material_fact', 'Dividendos', NULL, 1, 1, 'Pagamento de dividendos e lucro líquido do exercício')");
  await database.run("INSERT INTO asset_filings (filing_id, asset_id, document_type, category, subject, reference_time_start, reference_time_end, published_at, version, url, file_hash) VALUES ('fre-1', 'BR:stock:PETR4', 'fre', 'Formulário de Referência', 'FRE', DATE '2025-12-31', DATE '2025-12-31', TIMESTAMPTZ '2026-03-30 00:00:00-03', 5, 'https://www.rad.cvm.gov.br/ENET/fre-1', NULL)");
  await database.run(`INSERT INTO asset_filing_chunks (filing_id, asset_id, document_type, section, item, page, seq, text) VALUES
    ('fre-1', 'BR:stock:PETR4', 'fre', 'AtividadesEmissor 1.2 - Produtos', '1.2', 2, 1, 'Participação de mercado nas refinarias do país.'),
    ('fre-1', 'BR:stock:PETR4', 'fre', 'FatoresRisco 4.1 - Descrição dos fatores de risco', '4.1', 5, 2, 'Concorrentes podem reduzir a participação de mercado.'),
    ('fre-1', 'BR:stock:PETR4', 'fre', 'FatoresRisco 4.1 - Descrição dos fatores de risco', '4.1', 5, 3, 'Dividendos e proventos dependem do lucro líquido.'),
    ('fre-1', 'BR:stock:PETR4', 'fre', 'FatoresRisco 4.1_Rod2 Validação_RI', '4.1', 6, 6, 'Riscos do emissor com label sem espaço.'),
    ('fre-1', 'BR:stock:PETR4', 'fre', 'RemuneracaoAdministradores 8.1 - Remuneração', '8.1', 9, 4, 'A remuneração total dos administradores.'),
    ('fre-1', 'BR:stock:PETR4', 'fre', 'RemuneracaoAdministradores 8.10 - Anexo', '8.10', 12, 5, 'Anexo de remuneração por cargo.')`);
  // Why: search_chunks is built on the full-text extension, which the unit suite does not install; this stand-in has the same arguments and columns, so the example runs on the same schema.
  await database.run(`CREATE OR REPLACE MACRO search_chunks(q_text, q_asset_id, q_document_type, q_section, q_mode) AS TABLE
    SELECT asset_id, document_type, filing_id, section, page, seq, text, 1.0 AS score FROM asset_filing_chunks
    WHERE q_mode = 'text' AND asset_id = q_asset_id AND document_type = q_document_type AND (q_section IS NULL OR section = q_section) AND text ILIKE '%' || q_text || '%'`);
};

describe("GuideTexts.topicToText()", () => {
  it.each(GUIDE_TOPICS)("keeps the %s guide within the size limit (AC5)", (topic) => {
    expect(GuideTexts.topicToText[topic].length).toBeLessThanOrEqual(GuideTexts.MAX_CHARS);
  });

  it("contains at least one example in the sql and search topics", () => {
    expect(readExamples("sql").length).toBeGreaterThan(0);
    expect(readExamples("search").length).toBeGreaterThan(0);
  });

  it("finds the item 8.1 without the items 8.10 to 8.19 when it asks for the item number (AC14)", async () => {
    const database = await DuckDbAdapter.openWriter(":memory:");
    await DuckDbSchemaAdapter.createSchema(database);
    await seedDatabase(database);
    const rows = await database.readRows("SELECT seq, section FROM asset_filing_chunks WHERE asset_id = 'BR:stock:PETR4' AND filing_id = 'fre-1' AND item = '8.1' ORDER BY seq");
    expect(rows).toStrictEqual([{ seq: 4, section: "RemuneracaoAdministradores 8.1 - Remuneração" }]);
    const byLike = await database.readRows("SELECT seq FROM asset_filing_chunks WHERE filing_id = 'fre-1' AND section LIKE 'RemuneracaoAdministradores 8.1%' ORDER BY seq");
    expect(byLike).toStrictEqual([{ seq: 4 }, { seq: 5 }]);
    database.close();
  });

  it("finds the item 4.1 whatever the label says, because the item comes from CVM's element (issue #61)", async () => {
    const database = await DuckDbAdapter.openWriter(":memory:");
    await DuckDbSchemaAdapter.createSchema(database);
    await seedDatabase(database);
    const rows = await database.readRows("SELECT seq FROM asset_filing_chunks WHERE asset_id = 'BR:stock:PETR4' AND filing_id = 'fre-1' AND item = '4.1' ORDER BY seq");
    expect(rows).toStrictEqual([{ seq: 2 }, { seq: 3 }, { seq: 6 }]);
    database.close();
  });

  it.each(GUIDE_TOPICS)("has examples that the SQL guard accepts and the store runs, in %s (AC3)", async (topic) => {
    const database = await DuckDbAdapter.openWriter(":memory:");
    await DuckDbSchemaAdapter.createSchema(database);
    await seedDatabase(database);
    // Why: the search examples run on the index the server builds, so the search macro exists when they are read.
    await FullTextIndexService.buildIndex(database);
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
