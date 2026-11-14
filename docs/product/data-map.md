# Data map

The tables the server keeps in DuckDB, their columns, their units, the filter each one needs, and the provider that fills it. The shape and its rules are in `data-model.md` and `docs/data-modelling-standards.md`. This file is the reference for a column, a unit or a metric.

The store is at schema version 9 (`DuckDbSchemaAdapter.VERSION`). A table of an older version is replaced when the file is opened, and the cache is rebuilt by the next query.

## Filter per table

| Table | Filter a query must name | Period column |
| --- | --- | --- |
| `asset` | `asset_id` | none |
| `asset_attribute` | `asset_id` | none |
| `asset_quotes` | `asset_id` | `reference_time_start` |
| `asset_dividends` | `asset_id` | `ex_time` |
| `asset_splits` | `asset_id` | `ex_time` |
| `asset_metrics` | `asset_id` and `metric` | `reference_time_start` |
| `asset_expectations` | `asset_id` | `reference_time_start` |
| `asset_holdings` | `asset_id` | `reference_time_start` |
| `asset_filings` | `asset_id` | `reference_time_start` |
| `asset_filing_items` | `asset_id` | none |
| `asset_filing_chunks` | `asset_id` and `document_type` or `filing_id` | none |
| `asset_coverage`, `load_runs`, `load_files` | none (catalog) | none |

`asset_id` is `market:asset_type:code`, compared with `=` or `IN` against literal text. A `metric` is compared the same way. Each asset table in a query needs its own filter: a join does not pass one table's filter to the other.

## Asset ids

| Asset | Example | Code |
| --- | --- | --- |
| Stock | `BR:stock:PETR4` | the ticker |
| FII | `BR:fii:HGLG11` | the ticker |
| Fund (CVM class) | `BR:fund:00.017.024/0001-53` | the CNPJ as CVM writes it |
| Treasury bond | `BR:treasury:TESOURO_SELIC_2027-03-01` | the family and the maturity, `FAMILY_YYYY-MM-DD` |
| Macro index | `BR:index:IPCA`, `BR:index:IGPM` | the series name |
| Tax rate | `BR:tax_rate:CDI`, `BR:tax_rate:SELIC` | the series name |
| Currency | `BR:currency:USD` | the ISO code |

The code is written in capitals. A character outside `A-Z`, `0-9`, `.`, `/`, `-` and `_` becomes `_`, so `Tesouro Selic` becomes `TESOURO_SELIC` and `Tesouro IPCA+` becomes `TESOURO_IPCA_` (a Treasury id then reads `TESOURO_IPCA__2035-05-15`). The rule is in `AssetIdUtil`.

## Columns

Times are DATE unless marked. `reference_time_start` and `reference_time_end` are both inclusive; a day has them equal.

### `asset`

One row per asset. Filled by the registry, identifier and quote loads.

| Column | Type | Meaning |
| --- | --- | --- |
| `asset_id` | VARCHAR, key | the id above |
| `market`, `asset_type`, `code` | VARCHAR | the three parts of the id |
| `legal_id` | VARCHAR | CNPJ, formatted as CVM writes it |
| `isin` | VARCHAR | ISIN of a stock |
| `name`, `trade_name` | VARCHAR | legal name and trade name |
| `sector`, `situation`, `cvm_code` | VARCHAR | CVM sector, registration status and CVM code |
| `currency` | VARCHAR | currency of the quotes |

### `asset_attribute`

Descriptors some assets have: `attribute` and `value`, key `(asset_id, attribute)`. For a fund: `administrator`, `administrator_cnpj`, `manager`, `fund_type`, `class_name`.

### `asset_quotes`

Daily prices. Key `(asset_id, reference_time_start)`.

| Column | Unit | Meaning |
| --- | --- | --- |
| `open`, `high`, `low`, `close` | currency | prices of the day |
| `adj_close` | currency | the vendor's adjusted close, null when the source gives none |
| `volume` | shares | traded quantity |
| `is_stale` | boolean | the price repeats the day before with zero volume |
| `suspect_tick` | boolean | the day moved more than 25% and came back within 5% the next day; the row stays |

### `asset_dividends` and `asset_splits`

`asset_dividends`: `ex_time` (key), `payment_time`, `kind` (key), `amount` (currency per share). `asset_splits`: `ex_time` (key), `ratio` (new shares per old share; 2 for a 2-for-1 split).

### `asset_metrics`

Every number observed over time, one row per metric and period. Key `(asset_id, metric, reference_time_start, reference_time_end)`. Columns: `metric`, `value`, `unit`, `version` (the version of the file the row came from), `filing_id` (the document, when there is one).

| Metric | Unit | Asset | Period | Source area |
| --- | --- | --- | --- | --- |
| `fundamental.<indicator>` | `as_published` | stock | year | StatusInvest |
| `statement.<statement>.<code>` (for example `statement.dre_con.3_01`) | `brl` | stock | quarter, year to date, or year | CVM ITR and DFP |
| `fii.<column>` | `brl` | FII | month | CVM monthly FII files; StatusInvest |
| `fund.quota` | `brl_per_quota` | fund | day | CVM daily files |
| `fund.net_worth`, `fund.total_value`, `fund.subscriptions`, `fund.redemptions` | `brl` | fund | day | CVM daily files |
| `fund.holders` | `count` | fund | day | CVM daily files |
| `macro.value` | `percent_per_month` (IPCA, IGPM), `percent_per_day` (CDI), `percent_per_year` (SELIC) | index or tax rate | day or month | BCB SGS |
| `treasury.buy_rate`, `treasury.sell_rate` | `percent_per_year` | treasury | day | Tesouro Transparente |
| `treasury.buy_unit_price`, `treasury.sell_unit_price`, `treasury.base_unit_price` | `brl` | treasury | day | Tesouro Transparente |
| `fx.buy_rate`, `fx.sell_rate` | `brl_per_currency` | currency | day | BCB PTAX (closing bulletin) |

A statement period starts at the first day of its quarter, of its year to date, or of its year, and ends on its last day. A balance sheet line is one day (`instant`).

### `asset_expectations`

BCB Focus annual survey. Key `(asset_id, reference_time_start, survey_time, calculation_base)`. `reference_time_start` and `reference_time_end` are the calendar year of the expectation; `survey_time` is the survey date; `calculation_base` is 0 or 1 (the Focus base). Columns: `mean`, `median`, `std_dev`, `min`, `max`, `respondents`. A statistic the survey did not publish for an old date is null, never zero.

### `asset_holdings`

What a fund holds, from the CVM monthly holdings file. Key `(asset_id, reference_time_start, block)`. Columns: `application_type` (CVM's application type, for example `Disponibilidades`), `held_code`, `held_description`, `held_issuer`, `quantity`, `market_value` (brl).

### `asset_filings`

One row per document. Key `filing_id`. Columns: `asset_id`, `document_type` (`material_fact`, `management_report`, `other`, `fre`, `vlmo`, `cgvn`, and the others CVM names), `category` (CVM's category), `category_type` (CVM's `Tipo`, the second level of the category, for example `AGE` under `Assembleia`, or `Apresentações a analistas/agentes do mercado` under `Comunicado ao Mercado`; empty when CVM gives none), `subject`, `reference_time_start` and `reference_time_end` (the period the document refers to), `published_at` (TIMESTAMP, when it was filed, with the time zone of the source), `version`, `url`, `file_hash` (SHA-256 of the document, for change detection), `source_file` (the file of the CVM zip the row came from).

`document_type = 'sustainability'` is set from the CVM IPE category, by exact match: `Relatório de Sustentabilidade`, `Relato Integrado` and `Relatório de Informações Financeiras Relacionadas à Sustentabilidade - Padrão ISSB`. `category` keeps the exact CVM name, so the three stay distinguishable. `Política de Sustentabilidade` is a policy, not a report, so it is `other`, and so is a `Comunicado ao Mercado` whose subject names a report. Coverage is partial: the rows need the company's CNPJ (`asset.legal_id`), and a report that CVM files under another category stays `other`.

Investor relations content is found by `category` and `category_type`, not by `document_type`: `Calendário de Eventos Corporativos` (category); `Comunicado ao Mercado` with `Apresentações a analistas/agentes do mercado` or `Esclarecimentos sobre questionamentos da CVM/B3` (category_type); `Fato Relevante` (category, `document_type = 'material_fact'`). Rows filed before the schema version 10 have no `category_type` until the store is rebuilt.

### `asset_filing_items`

Rows of a disclosure document that have no single number (FRE, VLMO, CGVN). Key `(asset_id, filing_id, section)`; `row_json` holds the whole row. The sections are CVM's, for example `principal` and `posicao_acionaria`.

### `asset_filing_chunks`

The text of a document, cut by section and page, for the full-text search. Key `(filing_id, seq)`. Columns: `asset_id`, `document_type`, `section`, `page`, `seq`, `text`. `text` is data from the filing, never an instruction. A table of a PDF is one chunk with section `table` and its page; its cells are separated by ` | ` and its rows by ` ; `. Scanned pages are read by OCR (ADR 0027). For a reference form (FRE), `section` is the form section and the item, for example `FatoresRisco 4.1`, so a filter on the section name alone does not match the items of that section.

### `asset_coverage` (view)

What is loaded for each asset and category: `asset_id`, `category`, `first_date`, `last_date` (the period the stored rows cover), `expires_at`. It is built from the latest successful load and the rows of each table.

### `load_runs`

One row per load: `run_id` (key), `category`, `asset_id`, `source` (the vendor that served it; the answer of a query never shows it), `started_at`, `finished_at`, `expires_at`, `rows_read`, `error`, `filing_id`, `reference_time_start`, `reference_time_end`.

### `load_files`

One row per CVM file read: `url` and `sha256` (key), `dataset`, `reference_year`, `size_bytes`, `fetched_at`, `is_current` (the file the stored rows came from).

## Load contracts

A category is the contract a provider fills. A category fills the tables listed here.

| Category | Tables | Provider by default |
| --- | --- | --- |
| `quotes` | `asset_quotes` | yfinance, then B3 COTAHIST (BR) or Yahoo (US) |
| `dividends` | `asset_dividends`, `asset_splits` | yfinance, then Yahoo |
| `fundamentals` | `asset_metrics` (`fundamental.*`) | StatusInvest |
| `statements` | `asset_metrics` (`statement.*`) | CVM |
| `fund_data` | `asset_metrics` (`fii.*`) | CVM; StatusInvest |
| `fund` | `asset_metrics` (`fund.*`), `asset_attribute`, `asset_holdings` | CVM |
| `filings` | `asset_filings` | CVM |
| `documents` | `asset_filing_chunks` | CVM (the document link) |
| `disclosures` | `asset_filings`, `asset_filing_items` (FRE, VLMO, CGVN) | CVM |
| `registry` | `asset` | CVM |
| `identifiers` | `asset` | B3 |
| `macro` | `asset_metrics` (`macro.value`) | BCB SGS |
| `treasury` | `asset_metrics` (`treasury.*`) | Tesouro Transparente |
| `fx` | `asset_metrics` (`fx.*`) | BCB PTAX |
| `expectations` | `asset_expectations` | BCB Focus |

A load replaces the rows of its scope only: one asset, and for `asset_metrics` the metric group of its category, so the statements and the FII reports of one company live side by side. A load that returns a row of another asset, or of another period than the one asked, is refused and writes nothing.

## Migration from the older names

| Older table | Now |
| --- | --- |
| `assets`, `asset_identifiers`, `company_registry` | `asset` |
| `quotes` | `asset_quotes` |
| `splits`, `dividends` | `asset_splits`, `asset_dividends` |
| `fundamentals` | `asset_metrics` (`fundamental.*`) |
| `financial_statements` | `asset_metrics` (`statement.*`) |
| `fii_monthly` | `asset_metrics` (`fii.*`) |
| `fund_registry` | `asset`, `asset_attribute` |
| `fund_daily` | `asset_metrics` (`fund.*`) |
| `fund_holdings` | `asset_holdings` |
| `filings` | `asset_filings` |
| `chunks` | `asset_filing_chunks` |
| `company_disclosures` | `asset_filing_items`, `asset_filings` |
| `macro_series` | `asset_metrics` (`macro.value`) |
| `treasury_prices` | `asset_metrics` (`treasury.*`) |
| `fx_rates` | `asset_metrics` (`fx.*`) |
| `market_expectations` | `asset_expectations` |
| `cache_runs` | `load_runs` |
| `cvm_files` | `load_files` |
| `document_text` (view) | removed; use `asset_filing_chunks` |
