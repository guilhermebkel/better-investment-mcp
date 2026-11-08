import type { DatabasePort } from "@/Protocols/DatabaseProtocol.ts";

const ASSET_KEY = "market VARCHAR NOT NULL, ticker VARCHAR NOT NULL, asset_type VARCHAR NOT NULL";
const FII_COLUMNS = [
  "distribution_per_unit", "rental_revenue", "property_sales_revenue", "other_revenue", "total_revenue",
  "distributable_income", "management_fee", "performance_fee", "property_acquisitions", "other_expenses",
  "total_expenses", "liquidity_requirement", "cash_available", "government_bonds", "corporate_bonds",
  "fixed_income_funds", "net_worth",
].map((column) => `${column} DOUBLE`).join(", ");

export class DuckDbSchemaAdapter {
  static readonly VERSION = 3;

  static readonly STATEMENTS: readonly string[] = [
    "CREATE TABLE schema_version (version INTEGER NOT NULL);",
    `INSERT INTO schema_version (version) VALUES (${DuckDbSchemaAdapter.VERSION});`,
    `CREATE TABLE assets (${ASSET_KEY}, legal_id VARCHAR, name VARCHAR, sector VARCHAR, currency VARCHAR, PRIMARY KEY (market, ticker));`,
    `CREATE TABLE filings (filing_id VARCHAR PRIMARY KEY, ${ASSET_KEY}, filing_type VARCHAR, category VARCHAR, reference_date DATE, delivered_at TIMESTAMPTZ, subject VARCHAR, url VARCHAR, file_hash VARCHAR, source VARCHAR NOT NULL);`,
    `CREATE TABLE chunks (filing_id VARCHAR NOT NULL, ${ASSET_KEY}, filing_type VARCHAR NOT NULL, section VARCHAR, page INTEGER, seq INTEGER NOT NULL, text VARCHAR NOT NULL, PRIMARY KEY (filing_id, seq));`,
    `CREATE TABLE quotes (${ASSET_KEY}, date DATE NOT NULL, open DOUBLE, high DOUBLE, low DOUBLE, close DOUBLE, adj_close DOUBLE, volume DOUBLE, is_stale BOOLEAN, suspect_tick BOOLEAN, source VARCHAR NOT NULL, PRIMARY KEY (market, ticker, date));`,
    `CREATE TABLE dividends (${ASSET_KEY}, ex_date DATE NOT NULL, pay_date DATE, amount DOUBLE, kind VARCHAR NOT NULL, source VARCHAR NOT NULL, PRIMARY KEY (market, ticker, ex_date, kind));`,
    `CREATE TABLE splits (${ASSET_KEY}, date DATE NOT NULL, ratio DOUBLE, source VARCHAR NOT NULL);`,
    `CREATE TABLE fundamentals (${ASSET_KEY}, year INTEGER NOT NULL, metric VARCHAR NOT NULL, value DOUBLE, source VARCHAR NOT NULL, PRIMARY KEY (market, ticker, year, metric));`,
    `CREATE TABLE financial_statements (${ASSET_KEY}, period_end DATE NOT NULL, period_type VARCHAR NOT NULL, statement VARCHAR NOT NULL, line_item VARCHAR NOT NULL, value DOUBLE, currency VARCHAR, source VARCHAR NOT NULL, version INTEGER, source_file VARCHAR);`,
    `CREATE TABLE fii_monthly (${ASSET_KEY}, period DATE NOT NULL, ${FII_COLUMNS}, source VARCHAR NOT NULL, version INTEGER, source_file VARCHAR, PRIMARY KEY (market, ticker, period));`,
    "CREATE TABLE macro_series (series VARCHAR NOT NULL, date DATE NOT NULL, value DOUBLE, source VARCHAR NOT NULL, PRIMARY KEY (series, date));",
    "CREATE TABLE cache_runs (run_id VARCHAR PRIMARY KEY, category VARCHAR NOT NULL, market VARCHAR NOT NULL, ticker VARCHAR NOT NULL, source VARCHAR NOT NULL, started_at TIMESTAMPTZ NOT NULL, finished_at TIMESTAMPTZ, expires_at TIMESTAMPTZ, rows_read BIGINT, error VARCHAR, filing_id VARCHAR, period_from DATE, period_to DATE);",
    "CREATE TABLE cvm_files (url VARCHAR NOT NULL, dataset VARCHAR NOT NULL, reference_year INTEGER NOT NULL, sha256 VARCHAR NOT NULL, size_bytes BIGINT NOT NULL, fetched_at TIMESTAMPTZ NOT NULL, is_current BOOLEAN NOT NULL, PRIMARY KEY (url, sha256));",
    "CREATE VIEW document_text AS SELECT filing_id, seq, section, page, text FROM chunks ORDER BY filing_id, seq;",
    [
      "CREATE VIEW asset_coverage AS",
      "WITH latest_run AS (",
      "  SELECT category, market, ticker, source, expires_at,",
      "    row_number() OVER (PARTITION BY category, market, ticker ORDER BY finished_at DESC) AS run_rank",
      "  FROM cache_runs WHERE error IS NULL AND finished_at IS NOT NULL",
      "), period_span AS (",
      "  SELECT 'quotes' AS category, market, ticker, asset_type, min(date) AS first_date, max(date) AS last_date FROM quotes GROUP BY market, ticker, asset_type",
      "  UNION ALL SELECT 'dividends', market, ticker, asset_type, min(ex_date), max(ex_date) FROM dividends GROUP BY market, ticker, asset_type",
      "  UNION ALL SELECT 'fund_data', market, ticker, asset_type, min(period), max(period) FROM fii_monthly GROUP BY market, ticker, asset_type",
      "  UNION ALL SELECT 'statements', market, ticker, asset_type, min(period_end), max(period_end) FROM financial_statements GROUP BY market, ticker, asset_type",
      "  UNION ALL SELECT 'filings', market, ticker, asset_type, min(CAST(delivered_at AS DATE)), max(CAST(delivered_at AS DATE)) FROM filings GROUP BY market, ticker, asset_type",
      ")",
      "SELECT latest_run.market, latest_run.ticker, period_span.asset_type, latest_run.category,",
      "  period_span.first_date, period_span.last_date, latest_run.source, latest_run.expires_at",
      "FROM latest_run LEFT JOIN period_span USING (category, market, ticker) WHERE latest_run.run_rank = 1;",
    ].join("\n"),
  ];

  static async createSchema(writer: DatabasePort): Promise<void> {
    await writer.run(`BEGIN TRANSACTION; ${DuckDbSchemaAdapter.STATEMENTS.join("\n")} COMMIT;`);
  }
}
