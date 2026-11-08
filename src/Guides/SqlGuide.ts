export const SQL_GUIDE = `# SQL guide

Use query_sql to read the tables. Send one SELECT per call.

## Filter rule

Every data table in the query needs WHERE filters that compare with = or IN and literal values:
- quotes, splits, dividends, fundamentals, financial_statements, fii_monthly, filings: market, ticker and asset_type.
- chunks: market, ticker, asset_type, and filing_type or filing_id.
- macro_series: series.
- assets, cache_runs, asset_coverage: no filter.

A query without its filters is refused, and the answer names the filter to add.

## Examples

Prices, last five days:
\`\`\`sql
SELECT date, close, adj_close, volume FROM quotes WHERE market = 'BR' AND ticker = 'PETR4' AND asset_type = 'stock' ORDER BY date DESC LIMIT 5
\`\`\`

Dividends of a FII:
\`\`\`sql
SELECT ex_date, amount FROM dividends WHERE market = 'BR' AND ticker = 'KNRI11' AND asset_type = 'fii' ORDER BY ex_date DESC
\`\`\`

Yearly fundamentals since 2020:
\`\`\`sql
SELECT year, metric, value FROM fundamentals WHERE market = 'BR' AND ticker = 'PETR4' AND asset_type = 'stock' AND year >= 2020 ORDER BY year
\`\`\`

Monthly FII data, last twelve months:
\`\`\`sql
SELECT period, distribution_per_unit, total_revenue FROM fii_monthly WHERE market = 'BR' AND ticker = 'KNRI11' AND asset_type = 'fii' ORDER BY period DESC LIMIT 12
\`\`\`

Filings of a company:
\`\`\`sql
SELECT delivered_at, filing_type, subject, url FROM filings WHERE market = 'BR' AND ticker = 'PETR4' AND asset_type = 'stock' ORDER BY delivered_at DESC
\`\`\`

Macro series:
\`\`\`sql
SELECT date, value FROM macro_series WHERE series IN ('ipca', 'selic') ORDER BY date DESC LIMIT 24
\`\`\`

Catalog of loaded assets:
\`\`\`sql
SELECT market, ticker, name FROM assets
\`\`\`

## Notes

- Quote rows flagged is_stale or suspect_tick stay in the table; read the flags before you trust a day.
- An empty answer for an asset that failed to load says so. Check the loaded report.
- See also: sources, limits.
`;
