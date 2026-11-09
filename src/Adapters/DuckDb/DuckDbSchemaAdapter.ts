import type { DatabasePort } from "@/Protocols/DatabaseProtocol.ts";

const ASSET_ID_COLUMN = "asset_id VARCHAR NOT NULL";
const REFERENCE_COLUMNS = "reference_time_start DATE NOT NULL, reference_time_end DATE NOT NULL";

export class DuckDbSchemaAdapter {
  static readonly VERSION = 9;

  static readonly STATEMENTS: readonly string[] = [
    "CREATE TABLE schema_version (version INTEGER NOT NULL);",
    `INSERT INTO schema_version (version) VALUES (${DuckDbSchemaAdapter.VERSION});`,
    `CREATE TABLE asset (${ASSET_ID_COLUMN}, market VARCHAR NOT NULL, asset_type VARCHAR NOT NULL, code VARCHAR NOT NULL, legal_id VARCHAR, isin VARCHAR, name VARCHAR, trade_name VARCHAR, sector VARCHAR, situation VARCHAR, cvm_code VARCHAR, currency VARCHAR, PRIMARY KEY (asset_id));`,
    `CREATE TABLE asset_attribute (${ASSET_ID_COLUMN}, attribute VARCHAR NOT NULL, value VARCHAR, PRIMARY KEY (asset_id, attribute));`,
    `CREATE TABLE asset_quotes (${ASSET_ID_COLUMN}, ${REFERENCE_COLUMNS}, open DOUBLE, high DOUBLE, low DOUBLE, close DOUBLE, adj_close DOUBLE, volume DOUBLE, is_stale BOOLEAN, suspect_tick BOOLEAN, PRIMARY KEY (asset_id, reference_time_start));`,
    `CREATE TABLE asset_dividends (${ASSET_ID_COLUMN}, ex_time DATE NOT NULL, payment_time DATE, kind VARCHAR NOT NULL, amount DOUBLE, PRIMARY KEY (asset_id, ex_time, kind));`,
    `CREATE TABLE asset_splits (${ASSET_ID_COLUMN}, ex_time DATE NOT NULL, ratio DOUBLE, PRIMARY KEY (asset_id, ex_time));`,
    `CREATE TABLE asset_metrics (${ASSET_ID_COLUMN}, metric VARCHAR NOT NULL, ${REFERENCE_COLUMNS}, value DOUBLE, unit VARCHAR NOT NULL, version INTEGER, filing_id VARCHAR, PRIMARY KEY (asset_id, metric, reference_time_start, reference_time_end));`,
    `CREATE TABLE asset_expectations (${ASSET_ID_COLUMN}, ${REFERENCE_COLUMNS}, survey_time DATE NOT NULL, calculation_base INTEGER NOT NULL, mean DOUBLE, median DOUBLE, std_dev DOUBLE, min DOUBLE, max DOUBLE, respondents INTEGER, PRIMARY KEY (asset_id, reference_time_start, survey_time, calculation_base));`,
    `CREATE TABLE asset_holdings (${ASSET_ID_COLUMN}, ${REFERENCE_COLUMNS}, block VARCHAR NOT NULL, application_type VARCHAR, held_code VARCHAR, held_description VARCHAR, held_issuer VARCHAR, quantity DOUBLE, market_value DOUBLE);`,
    `CREATE TABLE asset_filings (filing_id VARCHAR PRIMARY KEY, ${ASSET_ID_COLUMN}, document_type VARCHAR NOT NULL, category VARCHAR, subject VARCHAR, reference_time_start DATE, reference_time_end DATE, published_at TIMESTAMPTZ, version INTEGER, url VARCHAR, file_hash VARCHAR, source_file VARCHAR);`,
    `CREATE TABLE asset_filing_items (${ASSET_ID_COLUMN}, filing_id VARCHAR NOT NULL, section VARCHAR NOT NULL, row_json VARCHAR NOT NULL);`,
    `CREATE TABLE asset_filing_chunks (filing_id VARCHAR NOT NULL, ${ASSET_ID_COLUMN}, document_type VARCHAR NOT NULL, section VARCHAR, page INTEGER, seq INTEGER NOT NULL, text VARCHAR NOT NULL, PRIMARY KEY (filing_id, seq));`,
    "CREATE TABLE load_runs (run_id VARCHAR PRIMARY KEY, category VARCHAR NOT NULL, asset_id VARCHAR NOT NULL, source VARCHAR NOT NULL, started_at TIMESTAMPTZ NOT NULL, finished_at TIMESTAMPTZ, expires_at TIMESTAMPTZ, rows_read BIGINT, error VARCHAR, filing_id VARCHAR, reference_time_start DATE, reference_time_end DATE);",
    "CREATE TABLE load_files (url VARCHAR NOT NULL, dataset VARCHAR NOT NULL, reference_year INTEGER NOT NULL, sha256 VARCHAR NOT NULL, size_bytes BIGINT NOT NULL, fetched_at TIMESTAMPTZ NOT NULL, is_current BOOLEAN NOT NULL, PRIMARY KEY (url, sha256));",
    [
      "CREATE VIEW asset_coverage AS",
      "WITH latest_run AS (",
      "  SELECT category, asset_id, expires_at,",
      "    row_number() OVER (PARTITION BY category, asset_id ORDER BY finished_at DESC) AS run_rank",
      "  FROM load_runs WHERE error IS NULL AND finished_at IS NOT NULL",
      "), period_span AS (",
      // Why: a metric is named by its group, and the group names the category the loader fills it under (the same map as the SQL guard).
      "  SELECT 'quotes' AS category, asset_id, min(reference_time_start) AS first_date, max(reference_time_end) AS last_date FROM asset_quotes GROUP BY asset_id",
      "  UNION ALL SELECT 'dividends', asset_id, min(ex_time), max(ex_time) FROM asset_dividends GROUP BY asset_id",
      "  UNION ALL SELECT 'expectations', asset_id, min(reference_time_start), max(reference_time_end) FROM asset_expectations GROUP BY asset_id",
      "  UNION ALL SELECT 'filings', asset_id, min(reference_time_start), max(reference_time_end) FROM asset_filings GROUP BY asset_id",
      "  UNION ALL SELECT CASE split_part(metric, '.', 1) WHEN 'statement' THEN 'statements' WHEN 'fundamental' THEN 'fundamentals' WHEN 'fii' THEN 'fund_data' WHEN 'fund' THEN 'fund' WHEN 'macro' THEN 'macro' WHEN 'treasury' THEN 'treasury' WHEN 'fx' THEN 'fx' END, asset_id, min(reference_time_start), max(reference_time_end) FROM asset_metrics GROUP BY 1, 2",
      ")",
      "SELECT latest_run.asset_id, latest_run.category, period_span.first_date, period_span.last_date, latest_run.expires_at",
      "FROM latest_run LEFT JOIN period_span USING (category, asset_id) WHERE latest_run.run_rank = 1;",
    ].join("\n"),
  ];

  static async createSchema(writer: DatabasePort): Promise<void> {
    await writer.run(`BEGIN TRANSACTION; ${DuckDbSchemaAdapter.STATEMENTS.join("\n")} COMMIT;`);
  }
}
