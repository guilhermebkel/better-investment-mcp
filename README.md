# better-investment-analysis-mcp

An open-source MCP server that gives AI agents data on Brazilian assets (US stocks later): prices, dividends, fundamentals, quarterly and annual reports, reference forms, FII monthly data and reports, and macro series. The agent reads everything with one read-only SQL tool over a local DuckDB cache that the server fills on demand. Nothing in the server writes to the outside world.

> **Work in progress.** The server skeleton is in place: the three tools answer, but the data behind them comes issue by issue. The list below shows what exists today.

> **Usage notice.** The output describes and locates information. It is not investment advice, a recommendation or an analysis of what to buy or sell. Unofficial; not affiliated with B3, CVM, Yahoo or any other data vendor.

## Tools

The server exposes <!-- tools:count -->3<!-- /tools:count --> tools. All of them are read-only.

<!-- tools:list -->
- `get_overview`: the server's usage notice.
- `get_guide`: the guide for one topic of `query_sql`. The guide texts come later.
- `query_sql`: one `SELECT` over the data tables. The data store comes later, so it answers with an error for now.
<!-- /tools:list -->

## Install

Available after the packaging issue:

    npx -y better-investment-analysis-mcp

## Development

    nvm use
    pnpm ensure-deps
    pnpm check:changed   # what a commit needs
    pnpm check           # everything, like CI

`AGENTS.md` lists every command, the layout and the rules. The architecture is in `docs/product/architecture.md`, the data tables in `docs/product/data-map.md`, and the decisions in `docs/adr/`. Work is planned as GitHub issues written as specs (`docs/agents/issue-tracker.md`).

## Data and licenses

The code is MIT. Data comes from third parties under their own terms: CVM open data is under ODbL, so this repository never ships a cached database; Yahoo Finance data is for personal use with no service guarantee. The terms of each vendor are checked in the issue that adds its adapter.

## License

MIT. See `LICENSE`.
