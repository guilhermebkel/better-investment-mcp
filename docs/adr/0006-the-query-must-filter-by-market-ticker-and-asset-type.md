# The query must filter by market, ticker and asset type, and the server loads what is missing

Every data table in a `query_sql` query must be filtered by `market`, `ticker` and `asset_type` with equality or `IN` with literal values. The server reads the filters, loads the assets that are missing or expired, and then runs the query. A query whose filters cannot be read is refused with an explanation.

## Considered options

- Letting the agent run any query and loading nothing: rejected. The agent would have to know what is loaded and call a load tool, which brings back a write tool.
- Loading every asset in advance: rejected. It is slow, it pulls data nobody asked for and it makes the cache large.
- Guessing the asset from the result of the query: rejected. A wrong guess loads the wrong data and hides the error.

## Consequences

- The SQL guard (issue #4) parses the query. If DuckDB's own parser cannot express what is needed, another parser is chosen in that issue and recorded here.
- `macro_series` is filtered by `series`, `chunks` also needs `filing_type` or `filing_id`, and the catalog tables need no filter.
- Whether `asset_type` can be left out when the ticker is unique is an open decision; until it is taken, it is required.
