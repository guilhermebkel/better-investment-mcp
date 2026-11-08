# All data is read through one SQL tool

The agent reads prices, dividends, fundamentals, statements, filings, FII data and macro series with one tool, `query_sql`, over a DuckDB file. There is no tool per kind of data.

## Considered options

- One tool per kind of data (a tool for quotes, one for dividends, and so on): rejected. Each tool returns a prepared shape, so the agent cannot take an average, join two assets or read the raw row. A SQL tool lets the model compute what it needs and reach the data directly.
- Returning averages and ratios from the server: rejected. The product describes and locates information; calculation belongs to the agent, in SQL.

## Consequences

- The tool list stays at three (`get_overview`, `get_guide`, `query_sql`), which keeps the context small.
- A bad query is the main failure, so the SQL guard (issue #4) and the guides (issue #13) carry the weight.
- The agent needs the table and column names, so `get_overview` and `get_guide` document them and their examples are run in tests.
