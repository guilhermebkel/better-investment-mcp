# Changelog

All notable changes to this project are in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The release workflow reads the section of the tag it publishes, so each version keeps a `## [x.y.z]` heading.

## [Unreleased]

### Added

- Yahoo Finance adapter: quotes, dividends, splits and the asset summary for `BR` and `US` tickers, with the `is_stale` and `suspect_tick` flags.
- BCB SGS adapter: the macro series `ipca`, `cdi`, `selic` and `ptax`, read in ten-year windows.
- CVM adapter: the filings list of a company from the yearly IPE file. A ticker needs a CNPJ link, which no source gives yet.
- StatusInvest adapter: fundamentals and FII monthly data, including the FII net worth.
- `get_overview` lists the tables, the filter rule, the guide topics, what is loaded and the cache TTL. `get_guide` serves four topics (`sql`, `search`, `sources`, `limits`); every SQL example in them is run against the SQL guard and the store in a test.
- The MCP server over stdio with three read-only tools: `get_overview`, `get_guide` and `query_sql`.
- `init` prints the client configuration for `npx` and for Docker.
- The DuckDB store and cache: a temporary file that holds the loaded data, with freshness per category, market and ticker.
- The npm package, a Docker image that runs as a non-root user, and the release workflow.
