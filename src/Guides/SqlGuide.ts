export const SQL_GUIDE = `# SQL guide

Use query_sql to read the tables. Send one SELECT per call.

## Filter rule

Every data table in the query needs WHERE filters that compare with = or IN and literal values:
- quotes, splits, dividends, fundamentals, financial_statements, fii_monthly, filings: market, ticker and asset_type.
- chunks: market, ticker, asset_type, and filing_type or filing_id.
- macro_series: series.
- treasury_prices: bond_type (a Tesouro Direto family, such as 'Tesouro Selic').
- market_expectations: indicator (ipca, selic, pib_total or cambio).
- fx_rates: currency (USD, EUR).
- fund_registry, fund_daily, fund_holdings: cnpj (the fund class CNPJ, as CVM writes it, for example 00.017.024/0001-53).
- asset_identifiers, company_registry: market, ticker and asset_type.
- assets, cache_runs, asset_coverage: no filter.

A query without its filters is refused, and the answer names the filter to add.

A period filter (\`period_end\` of financial_statements, \`period\` of fii_monthly, \`reference_date\` of filings) makes the loader load the years of that period. Without one, the last three years load.

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

Treasury prices of one bond family on a base date:
\`\`\`sql
SELECT maturity, buy_rate, sell_rate, base_unit_price FROM treasury_prices WHERE bond_type = 'Tesouro Selic' AND base_date = DATE '2026-11-06' ORDER BY maturity
\`\`\`

Market expectations for the Selic, the reference year 2027:
\`\`\`sql
SELECT survey_date, median_value, mean_value FROM market_expectations WHERE indicator = 'selic' AND calculation_base = 0 AND reference_year = 2027 ORDER BY survey_date DESC LIMIT 12
\`\`\`

Financial statements of one quarter, with the version and the file of each row:
\`\`\`sql
SELECT line_item, value, version, source_file FROM financial_statements WHERE market = 'BR' AND ticker = 'PETR4' AND asset_type = 'stock' AND period_end BETWEEN '2024-07-01' AND '2024-09-30' ORDER BY line_item
\`\`\`

FII monthly net worth from 2025, one row per reference month:
\`\`\`sql
SELECT period, net_worth, version FROM fii_monthly WHERE market = 'BR' AND ticker = 'IRDM11' AND asset_type = 'fii' AND period >= '2025-01-01' ORDER BY period
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
