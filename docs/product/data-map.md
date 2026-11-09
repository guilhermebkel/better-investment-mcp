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
| `fii_monthly` | market, ticker, asset_type, period, distribution_per_unit, rental_revenue, property_sales_revenue, other_revenue, total_revenue, distributable_income, management_fee, performance_fee, property_acquisitions, other_expenses, total_expenses, liquidity_requirement, cash_available, government_bonds, corporate_bonds, fixed_income_funds, net_worth, version, source_file, source | CVM monthly fund files (`fii-doc-inf_mensal`); StatusInvest for the columns CVM does not carry is blocked | #8, #28 |
| `macro_series` | **series**, **date**, value, source | BCB SGS (ipca 433, cdi 12, selic 432, ptax 1, igpm 189) | #7 |
| `treasury_prices` | **bond_type**, **maturity**, **base_date**, buy_rate, sell_rate, buy_unit_price, sell_unit_price, base_unit_price, source | Tesouro Transparente (`precotaxatesourodireto.csv`) | PR #30 |
| `market_expectations` | **indicator**, **reference_year**, **survey_date**, **calculation_base**, mean_value, median_value, std_dev, min_value, max_value, respondents, source | BCB Focus (Olinda `ExpectativasMercadoAnuais`) | PR #30 |
| `asset_identifiers` | **market**, **ticker**, **asset_type**, legal_id (CNPJ), isin, company_name, source | B3 listing and detail routes | PR #30 |
| `company_registry` | **market**, **ticker**, **asset_type**, legal_id (CNPJ), company_name, trade_name, sector, situation, cvm_code, source | CVM company file (`cad_cia_aberta.csv`) | PR #30 |
| `fx_rates` | **currency**, **date**, buy_rate, sell_rate, source | BCB PTAX (Olinda, closing bulletin) | PR #30 |
| `fund_registry` | **cnpj**, fund_name, fund_type, class_name, situation, administrator, administrator_cnpj, manager, net_worth, net_worth_date, source | CVM fund file (`cad_fi.csv`) | PR #30 |
| `fund_daily` | **cnpj**, **date**, quota, net_worth, total_value, subscriptions, redemptions, holders, source | CVM daily informe (`inf_diario_fi`, the last twelve months) | PR #30 |
| `fund_holdings` | **cnpj**, **period**, **block**, application_type, asset_category, asset_code, asset_description, issuer, quantity, market_value, source_file, source | CVM CDA (`cda_fi`, blocks 1 to 8, the last twelve months) | PR #30 |
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
| `treasury_prices` | `bond_type` | none |
| `market_expectations` | `indicator` | none |
| `fx_rates` | `currency` | none |
| `fund_registry`, `fund_daily`, `fund_holdings` | `cnpj` (the fund class CNPJ, as CVM writes it) | none |
| `asset_identifiers`, `company_registry` | `market`, `ticker`, `asset_type` | none |
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
| `fii_monthly` (net worth, liquidity, balance) | net_worth, liquidity_requirement, cash_available, government_bonds, corporate_bonds, fixed_income_funds, distributable_income | StatusInvest (blocked) | `fii-doc-inf_mensal` → `inf_mensal_fii_complemento_YYYY.csv` (`Patrimonio_Liquido`), `inf_mensal_fii_ativo_passivo_YYYY.csv` (the balance columns); joined on CNPJ and `Data_Referencia` | `distribution_per_unit`, the revenue and expense columns and `Percentual_Dividend_Yield_Mes` are not per-unit R$ amounts with ex or payment dates, and CVM's quarterly results (`fii-doc-inf_trimestral`) are not built here (see Known gap) | `period` = `Data_Referencia`, the first day of the reference month | built for the columns above |
| `fii_monthly` (distribution, revenue, expense) | distribution_per_unit, total_revenue, … | StatusInvest (blocked) | no monthly per-unit distribution in CVM | pending: no CVM field | — | pending |
| `quotes`, `dividends`, `splits` | prices, per-unit dividends with ex and pay dates, splits | Yahoo | no CVM daily OHLC; `VL_QUOTA` (NAV), `Preco_Unitario` (insider trades) and FRE max/min quotes are not market prices (P4) | market OHLC and per-unit dividends with dates | `date`, `ex_date` | Yahoo stays |
| `fundamentals` | metrics per year | StatusInvest (blocked) | metrics computable from `financial_statements` | pending per metric | `year` | pending |
| `fi-doc-inf_diario`, `fi-doc-cda`, FIDC, FIP, FIAGRO, securitization | NAV per quota, holdings, credit funds | — | `fi-doc-inf_diario`, `fi-doc-cda` and the others of the study | not in this release: each one is a Phase 2 dataset that a use case must ask for (issue #28, S8) | daily, monthly | not planned |
| `succession_events` (IRDM11 → IRIM11) | from, to, date, evidence | — | `fi-doc-eventual` documents of the two entities | the join policy is undecided (see Known gap); each entity keeps its own history | event | not built; no concatenated series |

## Values and units

- `macro_series.value`: `ipca` is percent change per month (SGS 433), `cdi` is percent per day (SGS 12), `selic` is the Copom target rate in percent per year (SGS 432), `ptax` is the sell rate in BRL per USD (SGS 1), `igpm` is the monthly percent change of the IGP-M (SGS 189). The units of the first four were checked against the service's answers; `igpm`'s unit was checked against three recent answers (-0.22, 1.57, 1.47), not against the series metadata.
- `macro_series` has no market: its rows use the market `SERIES` in the registry, so the setting is `INVESTMENT_MCP_MACRO_PROVIDER=SERIES:bcb`.
- `treasury_prices` is loaded per bond family: the filter `bond_type` names the family, and the registry market is `TDIR` (`INVESTMENT_MCP_TREASURY_PROVIDER=TDIR:tesouro`). The file holds the history of every family from 2004, so one load downloads it once for that family.
- `treasury_prices.buy_rate` and `sell_rate` are the morning rates of the base date, percent per year (the file's `Taxa Compra Manha` and `Taxa Venda Manha`). The unit prices (`buy_unit_price`, `sell_unit_price`, `base_unit_price`) are reais per bond, with the file's decimal comma read as a point. `maturity` is the bond's maturity date and `base_date` the date of the prices.
- `market_expectations` is loaded per indicator: the filter `indicator` names it, and the registry market is `FOCUS` (`INVESTMENT_MCP_EXPECTATIONS_PROVIDER=FOCUS:bcb`). `survey_date` is the date of the survey and `reference_year` the year the expectation is for.
- `market_expectations.calculation_base` is the service's `baseCalculo` (0 or 1). The service sends only the number, so its meaning was not checked: use it as a key that tells two surveys apart, not as a label.
- The stats of `market_expectations` (mean, median, standard deviation, minimum, maximum, respondents) are null for old surveys, when the service did not publish them. A row with an indicator detail is refused, because the table has no column for it.
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

## Tickers and CNPJ

A FII ticker resolves to its CNPJ through B3 (`asset_identifiers`): the B3 listing filters the ticker to a fund by its short name, the detail gives the CNPJ, and the ticker must be the fund's trading code or one of its other codes. A stock's CNPJ and ISIN come from the B3 detail of its issuer. The CVM adapters use the B3 CNPJ for a FII that the curated list does not hold. IRIM11 resolves to `41.076.564/0001-95`, the CNPJ of the CVM name `IRIDIUM CRI FII`.

## Succession of IRDM11 and IRIM11

Issue #28, S6. Each ticker keeps its own history: no concatenated series is built. The policy for joining the two series (adjusted or not, the factor, and the date of the event) is undecided and is an open decision of issue #28. B3 confirms the CNPJ of IRIM11 (`41.076.564/0001-95`), which is the CNPJ of the CVM name `IRIDIUM CRI FII`, so the two tickers are now resolved to their own funds.

## Not built in this release

- The quarterly results of FIIs (`fii-doc-inf_trimestral`: revenue and expense by quarter) and the annual FII data (`fii-doc-inf_anual`). They would be the proposed tables `fii_quarterly` and `fii_annual`; no use case in issue #28 needs them, so they wait for a task of their own.
- Fund NAV, holdings and credit funds (`fi-doc-inf_diario`, `fi-doc-cda`, FIDC, FIP, FIAGRO, securitization): Phase 2 of issue #28, each as its own unit when a use case asks for it.
- The policy for joining IRDM11 and IRIM11 into one series (adjusted or not, the factor and the date of the event). Until it is decided, each ticker keeps its own history.
- The per-unit distribution of FIIs with ex and payment dates. CVM does not publish one in these datasets (P4).
- The history of quotes before the current and the previous year, in COTAHIST, which a query does not reach yet (a period filter on `quotes` is not built).
- Fund files for FII: CVM's fund files cover FI, FIDC and FIF, not FII, so a FII has no daily quota or holdings in CVM's open data.
- The CVM registry of a fund class with no CNPJ match in `cad_fi` (a multi-class fund's class CNPJ can differ from the fund's CNPJ): the registry row is empty, not guessed.
- StatusInvest: blocked by a Cloudflare challenge. The server does not bypass it.

