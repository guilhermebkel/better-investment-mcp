# better-investment-analysis-mcp

An open-source MCP server that gives AI agents data on Brazilian assets (US stocks later): prices, dividends, fundamentals, quarterly and annual reports, reference forms, FII monthly data and reports, and macro series. The agent reads everything with one read-only SQL tool over a local DuckDB cache that the server fills on demand. Nothing in the server writes to the outside world.

> **Work in progress.** The server runs and its three tools answer, but the data behind them arrives issue by issue. The list below shows what exists today.

> **Usage notice.** The output describes and locates information. It is not investment advice, a recommendation or an analysis of what to buy or sell. Unofficial; not affiliated with B3, CVM, Yahoo or any other data vendor.

## Tools

The server exposes <!-- tools:count -->3<!-- /tools:count --> tools. All of them are read-only.

<!-- tools:list -->
- `get_overview`: the server's usage notice.
- `get_guide`: the guide for one topic of `query_sql`. The guide texts come later.
- `query_sql`: one `SELECT` over the data tables. Every data table needs filters on `market`, `ticker` and `asset_type`; a query without them is refused with the filter to add. The rules are in `docs/product/sql-guard.md`.
<!-- /tools:list -->

## Install

Add the server to your MCP client. `init` prints the configuration for Claude, Cursor and Codex, for `npx` and for Docker:

    npx -y better-investment-analysis-mcp init

With `npx`, the client starts the server:

    npx -y better-investment-analysis-mcp

With Docker, the cache is a named volume:

    docker run -i --rm -v better-investment-analysis-cache:/cache ghcr.io/guilhermebkel/better-investment-analysis-mcp

The package and the image are published with the first release (see `docs/product/releasing.md`).

## Configuration

Every setting is an environment variable. The server reads them once at start and stops with a message when one is wrong.

| Variable | Default | What it does |
| --- | --- | --- |
| `INVESTMENT_MCP_LOG_LEVEL` | `info` | `error`, `info` or `debug`. Log lines go to stderr. |
| `INVESTMENT_MCP_CACHE_DIR` | the system temporary directory | Where the DuckDB cache file is kept. Created when missing. |
| `INVESTMENT_MCP_CACHE_TTL_SECONDS` | `86400` | How long a loaded piece of data stays valid, in seconds. |
| `INVESTMENT_MCP_QUOTES_PROVIDER` | unset | Quote source per market, for example `BR:yahoo`. Unset, the category loads nothing. |
| `INVESTMENT_MCP_DIVIDENDS_PROVIDER` | unset | Dividend source per market. Same rule. |
| `INVESTMENT_MCP_FUNDAMENTALS_PROVIDER` | unset | Fundamentals source per market. Same rule. |
| `INVESTMENT_MCP_STATEMENTS_PROVIDER` | unset | Financial statements source per market, for example `BR:cvm`. Same rule. |
| `INVESTMENT_MCP_FUND_DATA_PROVIDER` | unset | FII monthly data source per market, for example `BR:cvm`. Same rule. |
| `INVESTMENT_MCP_FILINGS_PROVIDER` | unset | Filings list source per market, for example `BR:cvm`. Same rule. |
| `INVESTMENT_MCP_DOCUMENTS_PROVIDER` | unset | Document download source per market. Same rule. |
| `INVESTMENT_MCP_MACRO_PROVIDER` | unset | Macro series source. The series have no market, so the value is `SERIES:bcb`. |
| `INVESTMENT_MCP_TREASURY_PROVIDER` | unset | Tesouro Direto source. The bond families have no market, so the value is `TDIR:tesouro`. |
| `INVESTMENT_MCP_EXPECTATIONS_PROVIDER` | unset | Market expectations source. The indicators have no market, so the value is `FOCUS:bcb`. |
| `INVESTMENT_MCP_IDENTIFIERS_PROVIDER` | unset | CNPJ and ISIN of a ticker, from B3. The value is `BR:b3`. |
| `INVESTMENT_MCP_REGISTRY_PROVIDER` | unset | Company registry of a stock, from CVM. The value is `BR:cvm`. |
| `INVESTMENT_MCP_FX_PROVIDER` | unset | Closing PTAX rate per currency. The value is `FX:bcb`. |
| `INVESTMENT_MCP_FUND_PROVIDER` | unset | Fund registry, daily quota and holdings, keyed by CNPJ. The value is `FUND:cvm`. |

A provider variable names the vendor for each market: `BR:yahoo` uses one vendor, and `BR:yahoo>statusinvest` uses a second vendor only when the first fails. The vendors are added with their adapters.

## Data sources

| Vendor | Gives | Notes |
| --- | --- | --- |
| Yahoo Finance | quotes, dividends, splits, asset summary | Unofficial. Personal use, no service guarantee. |
| BCB SGS | macro series (ipca, cdi, selic, ptax, igpm) | Open data. |
| Tesouro Transparente | Tesouro Direto prices and rates, daily history from 2004 | Open data. One download of the file per bond family loaded. |
| BCB Focus (Olinda) | annual market expectations: ipca, selic, pib_total, cambio | Open data. |
| BCB PTAX (Olinda) | closing rate per currency and day (USD, EUR) | Open data. |
| B3 listing and COTAHIST | CNPJ and ISIN of a ticker; daily quotes of the current and the previous year | Public site routes. The COTAHIST file is about 90 MB per year, so its first load takes minutes. |
| CVM company and fund files | company registry (sector), fund registry, daily quota and holdings | Open data. |
| yfinance (Python library) | quotes, dividends and splits, as an alternative to Yahoo | Needs `python3` and `pip install yfinance` on the machine. Unofficial. |
| StatusInvest | fundamentals, FII monthly data | Blocked: the site answers with a Cloudflare challenge, which the server does not bypass. |
| CVM | filings list (IPE) | Open data. A ticker needs a CNPJ link that no source gives yet. |
| CVM | ITR, DFP, Formulário de Referência | Not built (issue #11). |
| FNET | FII management reports | Built only if a spike passes. |

The `source` of every row names the vendor that produced it.

## Development

    nvm use
    pnpm ensure-deps
    pnpm check:changed   # what a commit needs
    pnpm check           # everything, like CI

`AGENTS.md` lists every command, the layout and the rules. The architecture is in `docs/product/architecture.md`, the data tables in `docs/product/data-map.md`, and the decisions in `docs/adr/`. Work is planned as GitHub issues written as specs (`docs/agents/issue-tracker.md`).

## Licenses

The code is MIT (see `LICENSE`). Runtime dependencies use MIT, ISC, Apache-2.0, BSD or BlueOak licenses; `pnpm check:licenses` checks them.
