# Data map

The tables the agent reads with `query_sql`, and where each one comes from. This page is where the final columns live; the issue that creates a table changes the page in the same pull request. A column list marked *planned* is the starting point of that issue.

Every data row keeps the `source` that produced it. Key columns are in bold.

## Tables

| Table | Columns | Source | Built in |
| --- | --- | --- | --- |
| `assets` | **market**, **ticker**, asset_type, legal_id, name, sector, currency | Yahoo summary, CVM registry | #3, #6 |
| `filings` | **filing_id**, market, ticker, asset_type, filing_type, category, delivered_at, subject, url, file_hash, source | CVM IPE, FNET | #9, #12 |
| `chunks` | **filing_id**, **seq**, market, ticker, asset_type, filing_type, section, page, text | text of a filing | #10 |
| `quotes` | **market**, **ticker**, **date**, asset_type, open, high, low, close, adj_close, volume, is_stale, suspect_tick, source | Yahoo | #6 |
| `dividends` | **market**, **ticker**, **ex_date**, **kind**, asset_type, pay_date, amount, source | Yahoo | #6 |
| `splits` | market, ticker, date, asset_type, ratio, source | Yahoo | #6 |
| `fundamentals` | **market**, **ticker**, **year**, **metric**, asset_type, value, source | StatusInvest | #8 |
| `financial_statements` | market, ticker, asset_type, period_end, period_type, statement, line_item, value, currency, source | CVM ITR, DFP | #11 |
| `fii_monthly` | market, ticker, asset_type, period, distribution_per_unit, rental_revenue, property_sales_revenue, other_revenue, total_revenue, distributable_income, management_fee, performance_fee, property_acquisitions, other_expenses, total_expenses, liquidity_requirement, cash_available, government_bonds, corporate_bonds, fixed_income_funds, net_worth, source | StatusInvest | #8 |
| `macro_series` | **series**, **date**, value, source | BCB SGS | #7 |
| `cache_runs` | run_id, category, market, ticker, source, started_at, finished_at, expires_at, rows_read, error | the loader | #3, #5 |
| `schema_version` | version | the store (one row, the schema version of the file) | #3 |

## Views and macros

| Name | What it gives | Built in |
| --- | --- | --- |
| `document_text` | The chunks of one document in order: `filing_id`, `seq`, `section`, `page`, `text`. | #3, #10 |
| `asset_coverage` | What is loaded and how long it is valid: `market`, `ticker`, `asset_type`, `category`, `first_date`, `last_date`, `source`, `expires_at`. | #3 |
| `search_chunks(query, ticker, type, section)` | Full-text search over the chunks (BM25, Portuguese stemmer and stop words), with score, filing, section and page. | #10 |

## Filters

| Table | The `WHERE` must name |
| --- | --- |
| `quotes`, `dividends`, `splits`, `fundamentals`, `financial_statements`, `fii_monthly`, `filings` | `market`, `ticker`, `asset_type` |
| `chunks` | `market`, `ticker`, `asset_type` and `filing_type` or `filing_id` |
| `macro_series` | `series` |
| `assets`, `cache_runs`, `asset_coverage`, `schema_version` | nothing |

## Quality columns

`quotes.is_stale` and `quotes.suspect_tick` are flags. A flagged row is never removed.

- `is_stale`: the close equals the day before and the volume is zero (`QualityFlagService`).
- `suspect_tick`: the close moved more than 25% from the day before, and the day after is within 5% of that day before. The thresholds are `QualityFlagService.SUSPECT_MOVE` and `QualityFlagService.REVERT_BAND`.
- A day with no close from the vendor is skipped, never filled.

## Values and units

- `macro_series.value`: `ipca` is percent change per month (SGS 433), `cdi` is percent per day (SGS 12), `selic` is the Copom target rate in percent per year (SGS 432), `ptax` is the sell rate in BRL per USD (SGS 1). The units were checked against the service's answers.
- `macro_series` has no market: its rows use the market `SERIES` in the registry, so the setting is `INVESTMENT_MCP_MACRO_PROVIDER=SERIES:bcb`.
- `splits.ratio` is the new shares per old share (a 2-for-1 split is 2).
- `dividends.kind` is `dividend` for every Yahoo row; Yahoo does not tell a dividend from interest on equity.
- `assets.sector` and `assets.legal_id` are null from Yahoo: its chart endpoint gives neither.
- `fundamentals` and `fii_monthly` keep a missing value as null, never zero. `fii_monthly.net_worth` is read from the monthly net worth endpoint and stays null for a month that endpoint does not cover.
- `filings.filing_type` is `material_fact`, `sustainability` or `other`, from the CVM IPE categories. The IPE file does not hold ITR, DFP or Formulário de Referência; those come from other CVM datasets (issue #11) and are not built.
- `filings.filing_id` is a hash of the delivery protocol, version and document link, so a re-delivery keeps its own row.
- `filings.delivered_at` is the date of delivery at Brasília time (`-03:00`).

## Licenses of the data

CVM open data is published under ODbL, so this repository never ships a cached database. Yahoo Finance data is for personal use, with no service guarantee. BCB SGS data is open data. StatusInvest's terms of use were not read, and the site blocks requests from this server (ADR 0010).

## Known gap: tickers and CNPJ

CVM's IPE file and its company registry carry the CNPJ of a company, not its ticker. The CVM filings adapter needs a ticker-to-CNPJ link to answer a query for `BR:PETR4`. No source in the repository gives that link yet, so the load fails with a message that names the ticker, and the filings table stays empty until the link is chosen.
