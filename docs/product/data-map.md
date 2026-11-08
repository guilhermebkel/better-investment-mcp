# Data map

The tables the agent reads with `query_sql`, and where each one comes from. This page is where the final columns live; the issue that creates a table changes the page in the same pull request. A column list marked *planned* is the starting point of that issue.

Every data row keeps the `source` that produced it. Key columns are in bold.

## Tables

| Table | Columns (planned) | Source | Built in |
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
| `assets`, `cache_runs`, `asset_coverage` | nothing |

## Quality columns

`quotes.is_stale` and `quotes.suspect_tick` are flags. A flagged row is never removed (issue #6 writes the exact rules and thresholds here).

## Licenses of the data

CVM open data is published under ODbL, so this repository never ships a cached database. Yahoo Finance data is for personal use. The terms of each vendor are in the issue that adds its adapter.
