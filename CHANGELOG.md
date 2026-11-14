# Changelog

All notable changes to this project are in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The release workflow reads the section of the tag it publishes, so each version keeps a `## [x.y.z]` heading.

## [Unreleased]

### Added

- `asset_filings.category_type`: the CVM IPE `Tipo`, so an analyst presentation can be told apart from another notice (issue #41, phase 1).
- A stock's IR site, activity, sector and previous legal name from CVM's FCA form, in `asset_attribute` (issue #41, phase 2).
- CVM sanctioning proceedings in `asset_proceedings`, linked to a stock only by the defendant's name (ADR 0029, issue #41, phase 2).
- IBGE sector series: the number of companies by CNAE class, as `BR:sector:<code>` (ADR 0030, issue #41, phase 3).
- B3 index membership: a stock's weight in the ISE, ICO2 and IDIVERSA indexes (ADR 0031, issue #41, phase 4). IGPTW is blocked from this server.
- `notify_load_finish` (ADR 0028): a notice, one POST with the final status and the row counts of a background load and no data, to the https `callback_url` given, when the load finishes, for loaded and failed loads. Each load takes at most 5 notices. This is the one tool that is not read-only.

### Fixed

- StatusInvest fundamentals read each rank from its `value` number, not from `value_F` (the display text, for example `5,53%`). A rank with no number, such as `-%` or `-`, is stored as null. The sample responses of the site showed the change: every indicator of BBAS3 failed on `value_F`.
- A load in which the provider stores no row and names the items it could not read now fails: the entry says `no row was stored` with the items, nothing is written (the rows stored before are kept), and the run is not counted as fresh. Before, fundamentals with every indicator refused showed `fresh` with 0 rows for a day.
- `search_chunks` before any document is loaded says how to load one (a query on `asset_filing_chunks` with the `asset_id` and `document_type`), then search again.

### Changed

- The document size limit is 100 MiB (was 20 MiB) for the CVM and FNET documents.


- A load no longer stops for one bad item. A row outside the requested period is skipped and the rows inside it are stored; a StatusInvest value that is not a number skips only that indicator and year. The load entry names each skipped item in `itemErrors`, and the status stays `loaded`.
- The document download reads the link a filing names on any http or https host, with the size limit and the timeout. Before, only the CVM and FNET hosts were read. The server now fetches whatever address the filing data contains.
- A load that fails is not tried again on every query: after 3 failures of the same asset or filing within 60 minutes, the loader refuses it and names the failures, until the window passes. A source that blocks this server (StatusInvest answers 403) no longer keeps the query waiting.
- CVM FRE, VLMO and CGVN filings keep their document link (`LINK_DOC` or `Link_Download`, stored as https), and only the highest version of each reference form is kept; the older versions leave the store on the next load.
- `search_chunks` takes a fifth argument, the mode. Only `'text'` exists for now; the guard refuses any other mode by name. Semantic and hybrid modes come later (ADR 0023).
- Brazilian quotes fall back to B3's COTAHIST file when yfinance fails, instead of Yahoo: both read the same service, so Yahoo could not back up yfinance. The fallback has no adjusted close. US quotes keep Yahoo.
- The store moves to schema version 9: one `asset_id` (`market:asset_type:code`, for example `BR:stock:PETR4`) keys every asset table; the time columns are `reference_time_start` and `reference_time_end`; the numbers over time are the long table `asset_metrics` (`metric`, `value`, `unit`); the tables are named `asset_*` and `load_*`. `query_sql` filters on `asset_id`, and on `metric` for `asset_metrics`. The older names are mapped in `docs/product/data-map.md`.
- The `document_text` view is removed, because it had no `asset_id` filter; query `asset_filing_chunks` instead.
- The data tables no longer have a `source` column; the vendor of a load is kept once, in `load_runs` (ADR 0020). The answer of `query_sql` and `get_overview` do not name the vendor, nor whether a fallback served a load. The store is at schema version 8.

### Fixed

- The search index is rebuilt in one transaction, so a query that runs during a rebuild still finds the index that was there. Before, the rebuild dropped the chunk table in a commit of its own, and a query in that moment failed with "search_chunks does not exist".
- A query that needs `search_chunks` while its macro is missing builds the index first, when documents are stored; if it cannot, the answer says why.
- A ticker whose quote load has no price fails with its name (`yfinance has no quotes for <ticker>`), instead of loading nothing as a success.
- `query_sql` sends its rows once, in the text, within the 50,000-character limit. The structured content carries the counts, the truncation and the loaded report, not the rows. Before, the rows were sent twice, so a full answer was about twice the limit.
- An empty answer from `asset_attribute` or `asset_holdings` for a stock says those tables hold fund data only. A fund asked of a fund category points to its CNPJ, `BR:fund:<CNPJ>`.
- A reference form (FRE) is stored once per version. Its main section names the document as `ID_DOC` and its item sections as `ID_Documento`; the adapter read only the second, so one form was stored twice, and the copy without the link failed with "the filing has no link".
- A CVM link that answers with a web page is named as such, with the link and the advice to try again, and the load error names the document kind (for example `fre filing …`).
- A fund or an FII asked of the company registry says the registry covers stocks only, and where that asset's data is.
- The answer of `query_sql` names only the periods that loaded; a failed load's period is no longer reported as loaded.
- A missing search index is named (`search_chunks is not available`) instead of DuckDB's catalog error.
- The unknown-series and unknown-indicator errors name the asset type, so `tax_rate:CDI` is not reported as absent from a list that has it.
- A period load no longer fails with `Failed to bind value` when the provider also sends a table with no period column (such as `asset_splits` from yfinance). That error hid the quotes and dividends of every asset once the period check passed.
- The BCB macro series and the Focus expectations return only the period asked for, as the Yahoo and yfinance adapters already did. Before, the whole history reached the loader, which refused it.
- The Docker image installs `python3` and `yfinance` (pinned to 1.8.0) in a virtualenv, so the yfinance source works in the container. Before, the image had no Python, so the quotes and dividends fell back to the rate-limited Yahoo adapter. The Python tools stay out of the final image: pip and the build tools are in a build stage.

### Added

- Scanned pages of a PDF are read by OCR (OCRmyPDF with Tesseract, Portuguese and English), and the tables of a PDF are read from its native structure (PyMuPDF); both are optional tools set by `INVESTMENT_MCP_OCRMYPDF` and `INVESTMENT_MCP_PYTHON` (ADR 0027).
- A query that names a metric the catalog does not know says so, and lists the metrics of its group (for example `fii.dividend_yield`). The FII columns are checked against the adapters by a test.
- The sql guide has the dollar sell rate example (`fx.sell_rate`).
- `get_guide` (sql and search topics) has more examples: stock splits, ITR filings by date, ranked search by a vacancy passage and by a section. Every example is checked against the SQL guard and the schema by the test suite.
- HTTP mode for Docker and for a server on your own machine (`INVESTMENT_MCP_TRANSPORT=http`): Streamable HTTP at `/mcp` and `GET /health` on `INVESTMENT_MCP_HTTP_HOST` and `INVESTMENT_MCP_HTTP_PORT` (`127.0.0.1:3100` by default). Every `/mcp` request needs `Authorization: Bearer` with `INVESTMENT_MCP_HTTP_TOKEN`, which must be at least 8 characters and is required on every address (ADR 0025).
- The `health` command and a Docker `HEALTHCHECK` in the image, which exposes port 3100. `init` prints the Docker HTTP configuration next to the stdio one.
- `pnpm smoke` and the CI Docker job check HTTP mode too: `/health`, 401 without the token, and the three tools.
- The PDF inside a CVM periodic report zip (ITR) is read page by page, so its text can be searched (`search_chunks` with the document type `itr`).
- The text of a CVM reference form (FRE) is searchable: its items are read from the PDFs inside the form's XML, one section and item per chunk (ADR 0024).
- Loads that outlive `INVESTMENT_MCP_BACKGROUND_AFTER_SECONDS` (10 seconds by default, was 5) continue in the background. `query_sql` answers with the rows already stored, a warning that they may be incomplete, and the load id; The client follows it by running the query again (ADR 0022). A load that was running at a restart is closed as interrupted.
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
