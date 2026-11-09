# Changelog

All notable changes to this project are in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The release workflow reads the section of the tag it publishes, so each version keeps a `## [x.y.z]` heading.

## [Unreleased]

### Added

- Tesouro Direto prices and rates (Tesouro Transparente file, daily history from 2004) in `treasury_prices`, loaded per bond family with `bond_type = '...'`. Set `INVESTMENT_MCP_TREASURY_PROVIDER=TDIR:tesouro`.
- Annual market expectations from the BCB Focus survey (ipca, selic, pib_total, cambio) in `market_expectations`. Set `INVESTMENT_MCP_EXPECTATIONS_PROVIDER=FOCUS:bcb`.
- Loads write their rows in batches of 500 per statement; a full history that took minutes now takes seconds.
- The store moves to schema version 4. The cache file is rebuilt on the first run after the upgrade, which is safe because the cache is disposable.
- The IGP-M monthly change (BCB SGS 189) is a macro series: `series = 'igpm'` in `macro_series`.
- CVM open data as the primary source (issue #28): a period-aware load of `financial_statements`, `fii_monthly` and `filings`. A period filter in `query_sql` (`period_end`, `period`, `reference_date`) loads the years of the period; without one, the last three years load.
- A ticker maps to its CNPJ through the CVM company list (stocks); FIIs map through a short curated list with CVM's own names, and an unmapped ticker is reported as pending, never guessed.
- The CVM eventual fund file: FII management reports and material facts in `filings`, with their official link and CNPJ.
- The CVM monthly FII files: net worth and the balance columns in `fii_monthly`, with each row's version and file (`version`, `source_file`).
- A record of every CVM file downloaded (`cvm_files`: URL, year, hash, size, time), so a changed file is told apart from the one stored before.
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
