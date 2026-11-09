# Changelog

All notable changes to this project are in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The release workflow reads the section of the tag it publishes, so each version keeps a `## [x.y.z]` heading.

## [Unreleased]

### Changed

- `search_chunks` takes a fifth argument, the mode. Only `'text'` exists for now; the guard refuses any other mode by name. Semantic and hybrid modes come later (ADR 0023).
- Brazilian quotes fall back to B3's COTAHIST file when yfinance fails, instead of Yahoo: both read the same service, so Yahoo could not back up yfinance. The fallback has no adjusted close. US quotes keep Yahoo.
- The store moves to schema version 9: one `asset_id` (`market:asset_type:code`, for example `BR:stock:PETR4`) keys every asset table; the time columns are `reference_time_start` and `reference_time_end`; the numbers over time are the long table `asset_metrics` (`metric`, `value`, `unit`); the tables are named `asset_*` and `load_*`. `query_sql` filters on `asset_id`, and on `metric` for `asset_metrics`. The older names are mapped in `docs/product/data-map.md`.
- The `document_text` view is removed, because it had no `asset_id` filter; query `asset_filing_chunks` instead.
- The data tables no longer have a `source` column; the vendor of a load is kept once, in `load_runs` (ADR 0020). The answer of `query_sql` and `get_overview` do not name the vendor, nor whether a fallback served a load. The store is at schema version 8.

### Added

- Loads that outlive `INVESTMENT_MCP_BACKGROUND_AFTER_SECONDS` (5 seconds by default) continue in the background. `query_sql` answers with the rows already stored, a warning that they may be incomplete, and the load id; The client follows it by running the query again (ADR 0022). A load that was running at a restart is closed as interrupted.
- Every provider has a default: a query works with no provider variable. A default with a second vendor (yfinance, then Yahoo) falls back automatically when the first fails.
- CVM FRE, VLMO and CGVN rows of a company (`asset_filing_items`), with their section, date, version and the whole row as JSON.
- The CVM files that were read in memory (ITR, DFP, IPE, FCA, monthly FII files, fund filings) are now downloaded to a temporary file and streamed.
- B3 identifiers: a ticker's CNPJ and ISIN from the B3 listing and detail, so a FII outside the curated list resolves (IRIM11 now too).
- B3 COTAHIST daily quotes (`quotes`, `INVESTMENT_MCP_QUOTES_PROVIDER=BR:b3`), streamed from the yearly file.
- yfinance (Python library) for quotes and dividends, as the source map asks: `INVESTMENT_MCP_QUOTES_PROVIDER=BR:yfinance`. Needs `python3` and `pip install yfinance`.
- CVM company registry with the sector (`asset`), and CVM fund registry, daily quota and holdings keyed by CNPJ (`asset`, `asset_metrics`, `asset_holdings`).
- BCB PTAX closing rate per currency (`asset_metrics`).
- Tesouro Direto prices and rates (Tesouro Transparente file, daily history from 2004) in `asset_metrics`, loaded per bond family with `bond_type = '...'`. Set `INVESTMENT_MCP_TREASURY_PROVIDER=TDIR:tesouro`.
- Annual market expectations from the BCB Focus survey (ipca, selic, pib_total, cambio) in `asset_expectations`. Set `INVESTMENT_MCP_EXPECTATIONS_PROVIDER=FOCUS:bcb`.
- Loads write their rows in batches of 500 per statement; a full history that took minutes now takes seconds.
- The store moves to schema version 4. The cache file is rebuilt on the first run after the upgrade, which is safe because the cache is disposable.
- The IGP-M monthly change (BCB SGS 189) is a macro series: `series = 'igpm'` in `asset_metrics`.
- CVM open data as the primary source (issue #28): a period-aware load of `asset_metrics`, `asset_metrics` and `asset_filings`. A period filter in `query_sql` (`period_end`, `period`, `reference_date`) loads the years of the period; without one, the last three years load.
- A ticker maps to its CNPJ through the CVM company list (stocks); FIIs map through a short curated list with CVM's own names, and an unmapped ticker is reported as pending, never guessed.
- The CVM eventual fund file: FII management reports and material facts in `asset_filings`, with their official link and CNPJ.
- The CVM monthly FII files: net worth and the balance columns in `asset_metrics`, with each row's version and file (`version`, `source_file`).
- A record of every CVM file downloaded (`load_files`: URL, year, hash, size, time), so a changed file is told apart from the one stored before.
- A CVM failure is reported with its class (HTTP error, blocked request, file that could not be read, unmapped ticker) and never falls back to another source.
- FII management reports are read from their FNET link (the CVM index is the origin): the text is indexed and searched with `search_chunks`, as the CVM documents are.
- A live contract check against the CVM open data (`pnpm test:integration`) for the PETR4 statements, the IRDM11 monthly data and report, and the company list.
- Yahoo Finance adapter: quotes, dividends, splits and the asset summary for `BR` and `US` tickers, with the `is_stale` and `suspect_tick` flags.
- BCB SGS adapter: the macro series `ipca`, `cdi`, `selic` and `ptax`, read in ten-year windows.
- CVM adapter: the filings list of a company from the yearly IPE file. A ticker needs a CNPJ link, which no source gives yet.
- StatusInvest adapter: fundamentals and FII monthly data, including the FII net worth.
- `get_overview` lists the tables, the filter rule, the guide topics, what is loaded and the cache TTL. `get_guide` serves four topics (`sql`, `search`, `sources`, `limits`); every SQL example in them is run against the SQL guard and the store in a test.
- The MCP server over stdio with three read-only tools: `get_overview`, `get_guide` and `query_sql`.
- `init` prints the client configuration for `npx` and for Docker.
- The DuckDB store and cache: a temporary file that holds the loaded data, with freshness per category, market and ticker.
- The npm package, a Docker image that runs as a non-root user, and the release workflow.
