# Data map

The tables the agent reads with `query_sql`, and where each one comes from. This page is where the final columns live; the issue that creates a table changes the page in the same pull request. A column list marked *planned* is the starting point of that issue.

Every data row keeps the `source` that produced it. Key columns are in bold.

## Tables

| Table | Columns | Source | Built in |
| --- | --- | --- | --- |
| `assets` | **market**, **ticker**, asset_type, legal_id, name, sector, currency | Yahoo summary, CVM registry | #3, #6 |
| `filings` | **filing_id**, market, ticker, asset_type, filing_type, category, reference_date, delivered_at, subject, url, file_hash, source | CVM IPE, ITR/DFP/FRE, CVM eventual fund file (FNET links), FNET | #9, #12, #28 |
| `chunks` | **filing_id**, **seq**, market, ticker, asset_type, filing_type, section, page, text | text of a filing (CVM PDF, HTML) | #10 |
| `quotes` | **market**, **ticker**, **date**, asset_type, open, high, low, close, adj_close, volume, is_stale, suspect_tick, source | Yahoo | #6 |
| `dividends` | **market**, **ticker**, **ex_date**, **kind**, asset_type, pay_date, amount, source | Yahoo | #6 |
| `splits` | market, ticker, date, asset_type, ratio, source | Yahoo | #6 |
| `fundamentals` | **market**, **ticker**, **year**, **metric**, asset_type, value, source | StatusInvest | #8 |
| `financial_statements` | market, ticker, asset_type, period_end, period_type, statement, line_item, value, currency, version, source_file, source | CVM ITR, DFP | #11, #28 |
| `fii_monthly` | market, ticker, asset_type, period, distribution_per_unit, rental_revenue, property_sales_revenue, other_revenue, total_revenue, distributable_income, management_fee, performance_fee, property_acquisitions, other_expenses, total_expenses, liquidity_requirement, cash_available, government_bonds, corporate_bonds, fixed_income_funds, net_worth, version, source_file, source | CVM monthly fund files (`fii-doc-inf_mensal`); StatusInvest for the columns CVM does not carry is blocked (ADR 0010) | #8, #28 |
| `macro_series` | **series**, **date**, value, source | BCB SGS (ipca 433, cdi 12, selic 432, ptax 1, igpm 189) | #7 |
| `cache_runs` | run_id, category, market, ticker, source, started_at, finished_at, expires_at, rows_read, error, filing_id, period_from, period_to | the loader (`filing_id` set for a document; the period columns set for a period load) | #3, #5, #10, #28 |
| `cvm_files` | **url**, **sha256**, dataset, reference_year, size_bytes, fetched_at, is_current | the loader: one record per downloaded CVM file and version | #28 |
| `schema_version` | version | the store (one row, the schema version of the file) | #3 |

## Views and macros

| Name | What it gives | Built in |
| --- | --- | --- |
| `document_text` | The chunks of one document in order: `filing_id`, `seq`, `section`, `page`, `text`. | #3, #10 |
| `asset_coverage` | What is loaded and how long it is valid: `market`, `ticker`, `asset_type`, `category`, `first_date`, `last_date`, `source`, `expires_at`. | #3 |
| `search_chunks(query, market, ticker, asset_type, filing_type, section)` | Full-text search over the chunks (BM25, Portuguese stemmer and stop words), with score, filing, section and page. Rules in `search.md`. | #10 |
| `chunk_search`, `pt_stopwords` | The index source (`filing_id:seq` and the text) and the stop words. Written by the store; not for queries. | #10 |

## Filters

| Table | The `WHERE` must name | Period filter (optional) |
| --- | --- | --- |
| `quotes`, `dividends`, `splits`, `fundamentals`, `filings` | `market`, `ticker`, `asset_type` | `filings.reference_date` |
| `financial_statements`, `fii_monthly` | `market`, `ticker`, `asset_type` | `financial_statements.period_end`, `fii_monthly.period` |
| `chunks` | `market`, `ticker`, `asset_type` and `filing_type` or `filing_id` | none |
| `search_chunks` | the arguments `market`, `ticker`, `asset_type` and `filing_type` (literal strings); `section` may be NULL | none |
| `macro_series` | `series` | none |
| `assets`, `cache_runs`, `asset_coverage`, `schema_version`, `cvm_files` | nothing | none |

A period filter compares its column with a date literal, with `=`, `>=`, `>`, `<=`, `<`, `BETWEEN` or `IN`, for example `period_end BETWEEN '2024-01-01' AND '2024-12-31'` or `period >= DATE '2025-01-01'`. The loader loads the years of the period. A query with no period filter loads the last three years (the current year and the two before it). A bound given alone is completed with the default: a missing end runs to the end of the current year, and a missing start reaches back to the default start or to the end, whichever is earlier. A period longer than 10 years is refused with the reason, because each yearly file is tens of megabytes. A period filter that is not a date literal, or sits inside an `OR`, is not read as a bound and loads the default period.

## Quality columns

`quotes.is_stale` and `quotes.suspect_tick` are flags. A flagged row is never removed.

- `is_stale`: the close equals the day before and the volume is zero (`QualityFlagService`).
- `suspect_tick`: the close moved more than 25% from the day before, and the day after is within 5% of that day before. The thresholds are `QualityFlagService.SUSPECT_MOVE` and `QualityFlagService.REVERT_BAND`.
- A day with no close from the vendor is skipped, never filled.

## CVM consumption map (issue #28)

The map of the CVM open data that serves the tables above. CVM is the primary source of each field it carries; an external source is used only for a field CVM does not carry, for the same entity and period, and the answer names it. A CVM failure is never replaced by another source. A "candidate" is a field the study found; a "built" row is loaded by the server today.

| Table | Fields | Current source | CVM dataset → schema | Real gap | Period key | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `assets` (identity) | **market**, **ticker**, legal_id | Yahoo summary | stocks: `cia_aberta-fca` → `fca_cia_aberta_valor_mobiliario` (`Codigo_Negociacao` → `CNPJ_Companhia`, latest `Data_Referencia`). Funds: a list of pairs in `CvmTickerAdapter`, not from a dataset | FII tickers have no CVM registry (see Known gap) | snapshot | built for stocks; FII pairs curated |
| `financial_statements` | value, line_item, period_type, version, source_file | — | `cia_aberta-doc-itr` and `-dfp` → `itr_cia_aberta_DRE_con_YYYY.csv` etc. (`CvmStatementAdapter`) | none for the statements of a company | `period_end` (+ `period_type`) | built (#11, period-aware #28) |
| `filings` (company) | filing_type, category, url, delivered_at, reference_date | — | `cia_aberta-doc-ipe` (IPE); `cia_aberta-doc-itr`, `-dfp`, `-fre` (periodic) | none | `reference_date` = `Data_Referencia` or `DT_REFER`; `delivered_at` = `Data_Entrega` or `DT_RECEB` | built |
| `filings` (fund) | filing_type `management_report` / `material_fact` / `other`, category, url | — | `fi-doc-eventual` → `eventual_fi_YYYY.csv` (`TP_DOC`, `DT_COMPTC`, `DT_RECEB`, `LINK_ARQ`, `CNPJ_FUNDO_CLASSE`) | the PDF is hosted by FNET (`fnet.bmfbovespa.com.br`); CVM indexes the link, so the origin is `cvm` and the host is recorded apart (P5) | `reference_date` = `DT_COMPTC`; `delivered_at` = `DT_RECEB` | built for FIIs with a CNPJ pair; the text is read when a query asks for the chunks |
| `fii_monthly` (net worth, liquidity, balance) | net_worth, liquidity_requirement, cash_available, government_bonds, corporate_bonds, fixed_income_funds, distributable_income | StatusInvest (blocked, ADR 0010) | `fii-doc-inf_mensal` → `inf_mensal_fii_complemento_YYYY.csv` (`Patrimonio_Liquido`), `inf_mensal_fii_ativo_passivo_YYYY.csv` (the balance columns); joined on CNPJ and `Data_Referencia` | `distribution_per_unit`, the revenue and expense columns and `Percentual_Dividend_Yield_Mes` are not per-unit R$ amounts with ex or payment dates, and CVM's quarterly results (`fii-doc-inf_trimestral`) are not built here (see Known gap) | `period` = `Data_Referencia`, the first day of the reference month | built for the columns above |
| `fii_monthly` (distribution, revenue, expense) | distribution_per_unit, total_revenue, … | StatusInvest (blocked) | no monthly per-unit distribution in CVM | pending: no CVM field | — | pending |
| `quotes`, `dividends`, `splits` | prices, per-unit dividends with ex and pay dates, splits | Yahoo | no CVM daily OHLC; `VL_QUOTA` (NAV), `Preco_Unitario` (insider trades) and FRE max/min quotes are not market prices (P4) | market OHLC and per-unit dividends with dates | `date`, `ex_date` | Yahoo stays |
| `fundamentals` | metrics per year | StatusInvest (blocked) | metrics computable from `financial_statements` | pending per metric | `year` | pending |
| `fi-doc-inf_diario`, `fi-doc-cda`, FIDC, FIP, FIAGRO, securitization | NAV per quota, holdings, credit funds | — | `fi-doc-inf_diario`, `fi-doc-cda` and the others of the study | not in this release: each one is a Phase 2 dataset that a use case must ask for (issue #28, S8) | daily, monthly | not planned |
| `succession_events` (IRDM11 → IRIM11) | from, to, date, evidence | — | `fi-doc-eventual` documents of the two entities | the join policy is undecided (see Known gap); each entity keeps its own history | event | not built; no concatenated series |

## Values and units

- `macro_series.value`: `ipca` is percent change per month (SGS 433), `cdi` is percent per day (SGS 12), `selic` is the Copom target rate in percent per year (SGS 432), `ptax` is the sell rate in BRL per USD (SGS 1), `igpm` is the monthly percent change of the IGP-M (SGS 189). The units of the first four were checked against the service's answers; `igpm`'s unit was checked against three recent answers (-0.22, 1.57, 1.47), not against the series metadata.
- `macro_series` has no market: its rows use the market `SERIES` in the registry, so the setting is `INVESTMENT_MCP_MACRO_PROVIDER=SERIES:bcb`.
- `splits.ratio` is the new shares per old share (a 2-for-1 split is 2).
- `dividends.kind` is `dividend` for every Yahoo row; Yahoo does not tell a dividend from interest on equity.
- `assets.sector` and `assets.legal_id` are null from Yahoo: its chart endpoint gives neither.
- `fundamentals` and `fii_monthly` keep a missing value as null, never zero. A column CVM does not carry is null in `fii_monthly`.
- `fii_monthly.net_worth` is the CVM net worth (`Patrimonio_Liquido`). `fii_monthly.distributable_income` is the R$ total of income to distribute (`Rendimentos_Distribuir`); it is not a per-unit amount. `liquidity_requirement` is `Total_Necessidades_Liquidez`.
- `fii_monthly.period` is the first day of the reference month, as CVM publishes it (`2025-01-01` is January 2025). A month is never derived from a quarter or a year.
- `financial_statements.value` is in currency units: the file's scale (`MIL` or `UNIDADE`) is applied, so a thousand-scale value is multiplied by 1000. `currency` is `BRL` for the real.
- `financial_statements.statement` is the statement and the version: `DRE`, `BPA` (assets), `BPP` (liabilities and equity) or `DFC_MD` (cash flow, direct method), with `_con` for consolidated and `_ind` for individual, for example `DRE_con`.
- `financial_statements.line_item` is the CVM account code and name, for example `3.01 Receita de Venda`. The code is the key to use in a query; names change between companies.
- `financial_statements.period_type` is `quarter` (a three-month income statement), `ytd` (the year so far in a quarterly filing), `year` (a full year) or `instant` (a balance sheet date, which has no start date). `period_end` is the last day of the period.
- A line the file leaves without a value is absent for that period, never zero.
- `filings.filing_type` is `material_fact`, `sustainability`, `management_report` or `other` from the CVM IPE categories and the CVM eventual fund file (`RELAT GERENCIAL` is `management_report`, `FATO RELEV` is `material_fact`), and `itr`, `dfp` or `fre` from the yearly ITR, DFP and FRE datasets (issue #11). `filings.category` keeps the vendor's own name (`ITR`, `DFP`, `FRE WEB`, `RELAT GERENCIAL`).
- `filings.reference_date` is the period the document refers to (CVM's `Data_Referencia`, `DT_REFER` or `DT_COMPTC`). It is never guessed from a file name, and a row with no reference date is never kept for a period. `filings.delivered_at` is the delivery date at Brasília time (`-03:00`) and is a different column.
- `filings.filing_id` is a hash of the delivery protocol, version and document link, so a re-delivery keeps its own row.

### Versions

- `financial_statements.version` and `fii_monthly.version` are CVM's `VERSAO`: a restated period comes in a later version, and the row kept is the latest version of the period (the later filing date, then the higher version). `source_file` names the CVM file the row came from (for example `itr_cia_aberta_DRE_con_2024.csv`; for `fii_monthly` the two files that were joined, separated by ` + `).
- The answer to a query says the reference periods it loaded and that each row keeps its version and file.
- `cvm_files` keeps one record per downloaded CVM file and version: the URL, the dataset, the year, the SHA-256 hash, the size and the time of the download. A file downloaded again with a different hash makes the new copy current and keeps the old copy on record (`is_current`). The table rows of the period hold the current version, so a query sees the latest version of each row and not both.

### Other rules

- A load of `financial_statements` or `filings` for a company downloads the yearly CVM zips of the years of the period (ITR about 32 MB each, DFP about 13 MB, FRE about 8 MB, IPE about 2 MB). The first load is slow; the store keeps the result for `INVESTMENT_MCP_CACHE_TTL_SECONDS`, and a period is fresh only when a fresh load covers it.
- The CVM open data has no item text of the Formulário de Referência, so the reference form is not in `chunks` (issue #11, scope item S3, not built).
- A document is downloaded only from `www.rad.cvm.gov.br` (CVM) or `fnet.bmfbovespa.com.br` (FNET, the host of the FII reports linked by CVM), over https, and only when a query asks for its chunks. The text is indexed in `chunks` and searched with `search_chunks`. A scanned PDF without text is not read (no OCR).
- A load that cannot finish says which class of failure it is (HTTP error, blocked request, file that could not be read, or unmapped ticker); a CVM failure never falls back to another source.

## Known gap: tickers and CNPJ

CVM's files carry the CNPJ of a company or a fund, not its ticker. The CVM adapters resolve a ticker in two places, and nothing else:

- **Stocks**: the CVM company list (`fca_cia_aberta_valor_mobiliario`, the field `Codigo_Negociacao`), read for the current and the previous year. A ticker that is not in the list is **pending**: the load fails with the ticker named, and no CNPJ is guessed from a name or an ISIN. The list was checked for PETR4, VALE3 and BBAS3 (`src/Testing/fixtures/cvm/recorded-fca-valor-mobiliario-2025-sample.csv`), not for every company.
- **Funds (FIIs)**: CVM's datasets carry no ticker for a fund, and `cda_fie` gives only a partial lookup. The server keeps a short list in `CvmTickerAdapter` of the funds whose CNPJ was checked against CVM's own name. Today: `IRDM11`, CNPJ `28.830.325/0001-10`, CVM name `IRIDIUM REC IMOB FII`. Every other FII ticker is **pending** until its CNPJ is added to that list with its CVM name.

The succession of IRDM11 and IRIM11 (issue #28, S6): IRIM11's CNPJ was not confirmed. The CVM names with `IRIDIUM` that the 2025 monthly file holds are IRDM11's fund and `IRIDIUM CRI FII` (`41.076.564/0001-95`), which is not identified as IRIM11; so IRIM11 is pending. Queries for each ticker keep their own history; no concatenated series is built. The policy for joining the two series (adjusted or not, the factor, and the date of the event) is undecided and is an open decision of issue #28.

## Not built in this release

- The quarterly results of FIIs (`fii-doc-inf_trimestral`: revenue and expense by quarter) and the annual FII data (`fii-doc-inf_anual`). They would be the proposed tables `fii_quarterly` and `fii_annual`; no use case in issue #28 needs them, so they wait for a task of their own.
- Fund NAV, holdings and credit funds (`fi-doc-inf_diario`, `fi-doc-cda`, FIDC, FIP, FIAGRO, securitization): Phase 2 of issue #28, each as its own unit when a use case asks for it.
- The policy for joining IRDM11 and IRIM11 into one series (adjusted or not, the factor and the date of the event). Until it is decided, each ticker keeps its own history.
- The per-unit distribution of FIIs with ex and payment dates. CVM does not publish one in these datasets (P4).

