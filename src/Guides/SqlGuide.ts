export const SQL_GUIDE = `# SQL guide

Use query_sql to read the tables. Send one SELECT per call.

## Filter rule

Every asset table needs WHERE asset_id, compared with = or IN and literal values. An asset_id is market:asset_type:code, for example BR:stock:PETR4, BR:fii:KNRI11, BR:index:IPCA, BR:currency:USD or BR:fund:00.017.024/0001-53.
- asset_metrics also needs WHERE metric, compared with = or IN. A metric is group.name, for example fundamental.roe, statement.dre_con.3_01, fii.net_worth or macro.value. The unit column gives the unit of each row.
- asset_filing_chunks needs document_type or filing_id.
- asset_coverage and load_runs need no filter.

A query without its filter is refused, and the answer names the filter to add. A join works when each asset table in it has its own asset_id filter.

A period filter on reference_time_start (ex_time for asset_dividends) makes the loader load the years of that period. Without one, the current year and the two before it load.

## Examples

Prices, last five days:
\`\`\`sql
SELECT reference_time_start, close, adj_close, volume FROM asset_quotes WHERE asset_id = 'BR:stock:PETR4' ORDER BY reference_time_start DESC LIMIT 5
\`\`\`

Dividends of a FII:
\`\`\`sql
SELECT ex_time, amount, kind FROM asset_dividends WHERE asset_id = 'BR:fii:KNRI11' ORDER BY ex_time DESC
\`\`\`

Yearly fundamentals since 2020:
\`\`\`sql
SELECT reference_time_start, value, unit FROM asset_metrics WHERE asset_id = 'BR:stock:PETR4' AND metric IN ('fundamental.roe') AND reference_time_start >= '2020-01-01' ORDER BY reference_time_start
\`\`\`

One quarter of a statement line:
\`\`\`sql
SELECT reference_time_start, reference_time_end, value, unit, version FROM asset_metrics WHERE asset_id = 'BR:stock:PETR4' AND metric = 'statement.dre_con.3_01' AND reference_time_start BETWEEN '2024-07-01' AND '2024-09-30'
\`\`\`

FII monthly net worth from 2025:
\`\`\`sql
SELECT reference_time_start, value, unit FROM asset_metrics WHERE asset_id = 'BR:fii:KNRI11' AND metric = 'fii.net_worth' AND reference_time_start >= '2025-01-01' ORDER BY reference_time_start
\`\`\`

Macro series, last 24 months:
\`\`\`sql
SELECT reference_time_start, value, unit FROM asset_metrics WHERE asset_id = 'BR:index:IPCA' AND metric = 'macro.value' ORDER BY reference_time_start DESC LIMIT 24
\`\`\`

Treasury prices of one bond, in a month:
\`\`\`sql
SELECT reference_time_start, metric, value, unit FROM asset_metrics WHERE asset_id = 'BR:treasury:SELIC_2029-03-01' AND metric IN ('treasury.buy_rate', 'treasury.base_unit_price') AND reference_time_start BETWEEN '2026-11-01' AND '2026-11-30'
\`\`\`

Market expectations for the IPCA of 2027:
\`\`\`sql
SELECT survey_time, calculation_base, median, mean FROM asset_expectations WHERE asset_id = 'BR:index:IPCA' AND reference_time_start BETWEEN '2027-01-01' AND '2027-12-31' ORDER BY survey_time DESC LIMIT 12
\`\`\`

Filings of a company:
\`\`\`sql
SELECT published_at, document_type, subject, url FROM asset_filings WHERE asset_id = 'BR:stock:PETR4' ORDER BY published_at DESC
\`\`\`

Dollar sell rate (PTAX), last five days, in reais per dollar:\n\`\`\`sql\nSELECT reference_time_start, value FROM asset_metrics WHERE asset_id = 'BR:currency:USD' AND metric = 'fx.sell_rate' ORDER BY reference_time_start DESC LIMIT 5\n\`\`\`

Stock splits of a company, newest first:
\`\`\`sql
SELECT ex_time, ratio FROM asset_splits WHERE asset_id = 'BR:stock:PETR4' ORDER BY ex_time DESC
\`\`\`

Quarterly reports (ITR) filed since November 2025:
\`\`\`sql
SELECT published_at, reference_time_start, subject FROM asset_filings WHERE asset_id = 'BR:stock:PETR4' AND document_type = 'itr' AND published_at >= TIMESTAMPTZ '2025-11-01 00:00:00-03' ORDER BY published_at DESC
\`\`\`

A wrong metric name returns no rows, not an error; check the names in the data map.

## Notes

- Quote rows flagged is_stale or suspect_tick stay in the table; read the flags before you trust a day.
- An empty answer for an asset that failed to load says so. Check the loaded report.
- See also: sources, limits.
`;
