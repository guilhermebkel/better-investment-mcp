# Architecture

How the server is built. Everything here is the plan the issues follow; a part that is not built yet names the issue that builds it. The reasons are in `docs/adr/`.

## What the server is

An MCP server that gives an AI agent data on Brazilian assets (US stocks later): prices, dividends, fundamentals, company filings, FII monthly data and reports, and macro series. The agent reads everything with one SQL tool over a local DuckDB file that the server fills on demand. Nothing in the server writes to the outside world.

## Tools

Three tools, all read-only (`docs/adr/0003-all-data-is-read-through-one-sql-tool.md`):

- `get_overview`: what the server has, the tables, the filter rule, what is loaded now, and the usage notice.
- `get_guide`: one topic at a time (`sql`, `search`, `sources`, `limits`) with examples that run.
- `query_sql`: one `SELECT` over the tables below.

The skeleton is built in issue #2, the final texts in issue #13.

## The cache

Missing data is downloaded and indexed into a temporary DuckDB file (`docs/adr/0004-no-tool-writes-to-the-outside-world.md`). The file lives in `INVESTMENT_MCP_CACHE_DIR` (default: the system temporary directory), and each load is valid for `INVESTMENT_MCP_CACHE_TTL_SECONDS` (default 86,400). Deleting the file loses nothing. Issue #3 builds it.

## Asset identity

An asset is `market:ticker` (`BR:PETR4`, `US:AAPL`), with an `asset_type` in `stock`, `fii`, `fund`, `etf` or `bdr`.

## The query rules

These rules are enforced in code, not in a prompt (`docs/adr/0006-the-query-must-filter-by-market-ticker-and-asset-type.md`). Issue #4 builds the SQL guard.

- Only `SELECT` runs. The connection is read-only; its file system and extension autoload are locked after the full-text extension loads (ADR 0013).
- Every data table in the query must be filtered by `market`, `ticker` and `asset_type`, with equality or `IN` with literal values.
- `macro_series` is filtered by `series`. `chunks` also needs `filing_type` or `filing_id`; `search_chunks` takes the same filters as its arguments.
- The catalog tables `assets`, `cache_runs` and `asset_coverage` need no filter.
- A query whose filters cannot be read is refused with an explanation and a corrected example.
- At most 1,024 rows and 50,000 characters per answer; a cut is always reported.
- Before the query runs, the server loads what is missing or expired and returns a `loaded` report.

## Providers

One interface per data category, one adapter per vendor (`docs/adr/0005-one-provider-interface-per-data-category.md`). The environment variable of a category maps each market to a vendor, for example `BR:yahoo,US:yahoo`. Every row keeps the `source` that produced it. Issue #5 builds the registry and the loader.

<!-- providers:start -->
- `QuoteProvider`: prices and splits. `INVESTMENT_MCP_QUOTES_PROVIDER`. Yahoo Finance, the yfinance library, and B3 COTAHIST (daily quotes).
- `DividendProvider`: dividends. `INVESTMENT_MCP_DIVIDENDS_PROVIDER`. Yahoo Finance and the yfinance library.
- `FundamentalsProvider`: yearly fundamentals. `INVESTMENT_MCP_FUNDAMENTALS_PROVIDER`. StatusInvest.
- `StatementProvider`: financial statements (ITR, DFP). `INVESTMENT_MCP_STATEMENTS_PROVIDER`. CVM.
- `FundDataProvider`: periodic fund data (FII monthly). `INVESTMENT_MCP_FUND_DATA_PROVIDER`. CVM (StatusInvest is blocked).
- `FilingProvider`: the list of filings. `INVESTMENT_MCP_FILINGS_PROVIDER`. CVM and FNET.
- `DocumentProvider`: document download and text. `INVESTMENT_MCP_DOCUMENTS_PROVIDER`. CVM and FNET.
- `MacroProvider`: macro series. `INVESTMENT_MCP_MACRO_PROVIDER`. BCB SGS.
- `TreasuryProvider`: Tesouro Direto prices and rates per bond family. `INVESTMENT_MCP_TREASURY_PROVIDER`. Tesouro Transparente.
- `ExpectationsProvider`: annual market expectations (the BCB Focus survey). `INVESTMENT_MCP_EXPECTATIONS_PROVIDER`. BCB Olinda.
- `IdentifiersProvider`: a ticker's CNPJ and ISIN, from the B3 listing and detail. `INVESTMENT_MCP_IDENTIFIERS_PROVIDER`. B3.
- `RegistryProvider`: a company's legal name, sector and situation. `INVESTMENT_MCP_REGISTRY_PROVIDER`. CVM.
- `FxProvider`: the closing PTAX rate of a currency per day. `INVESTMENT_MCP_FX_PROVIDER`. BCB Olinda.
- `FundProvider`: a fund's registry, daily quota and holdings, keyed by CNPJ. `INVESTMENT_MCP_FUND_PROVIDER`. CVM.
- `DisclosuresProvider`: a company's reference form, securities holdings and governance rows (FRE, VLMO, CGVN). `INVESTMENT_MCP_DISCLOSURES_PROVIDER`. CVM.
<!-- providers:end -->

`scripts/source-coverage.json` classifies each provider as `implemented`, `planned` or `excluded` with a reason, and `pnpm source:drift` fails when this list and that file disagree.

## Vendors today

| Vendor | Gives | Issue | Notes |
| --- | --- | --- | --- |
| Yahoo Finance | quotes, dividends, splits, asset summary | #6 | Built. |
| BCB SGS | macro series | #7 | Built. Open data. |
| StatusInvest | fundamentals, FII monthly data | #8 | Built, but blocked by the site from this server. |
| CVM | filings list (IPE, ITR, DFP, FRE, the eventual fund file), ITR and DFP statements, FII monthly files, the company list that maps stock tickers to CNPJ | #9, #11, #28 | Built. The primary source of what it carries, with the version and the file of each row. A stock ticker maps through the company list; a FII ticker maps through a short curated list; any other ticker is pending. The reference form (FRE) has no item text in the open data. |
| FNET | FII management reports (PDF text, through the CVM link) | #12, #28 | Built for the documents linked from the CVM eventual fund file. The host is recorded apart from the CVM origin (P5). |

## Layers

`src/` follows the layers in `docs/code-standards.md`. The data flows like this:

1. `src/Setup/` starts the program. `src/Surfaces/` exposes the operations over MCP.
2. An operation in `src/Operations/` validates its input and calls services.
3. `QuerySqlOperation` calls the SQL guard, then the loader, then the read-only connection.
4. The loader asks the provider registry for an adapter per category and market, and writes the rows in one transaction per run.
5. Adapters in `src/Adapters/<Vendor>/` are the only code that reaches the network, and only to the hosts they declare.

## Safety in code

- Third-party document text is data and never an instruction.
- API keys and environment values are never returned or logged (`RedactUtil`).
- Nothing in `src/` runs a command on the host.
- The network exits only through adapters, to the hosts of the configured sources.
- The usage notice: the output describes and locates information; it is not investment advice.

## Not in scope of the product

Portfolio positions, investment recommendations and any calculation (returns, covariance, VaR). The agent computes in SQL.
