# The SQL guard

`query_sql` runs a query only after the guard accepts it. The guard reads the query with DuckDB's parser (`docs/adr/0009-the-sql-guard-reads-the-duckdb-syntax-tree.md`) and lists the assets and categories the query needs, so the loader can load them before the answer. The tables and their filters are in `data-map.md`.

## What is accepted

- One `SELECT` statement, with `WITH`, subqueries, joins, `UNION`, window functions and aggregations.
- Every asset table (`asset`, `asset_attribute`, `asset_quotes`, `asset_dividends`, `asset_splits`, `asset_metrics`, `asset_expectations`, `asset_holdings`, `asset_filings`, `asset_filing_items`, `asset_filing_chunks`) filtered by `asset_id`, compared with `=` or `IN` against literal text. The literal may be on either side of `=`. A query on several assets lists them in an `IN` list, up to 50.
- `asset_metrics` also filtered by `metric`, the same way. The metric's first word (its group) says the category it loads.
- `asset_filing_chunks` filtered by `document_type` or `filing_id`, in addition to `asset_id`.
- A period filter on `reference_time_start` (`ex_time` for `asset_dividends`): a comparison with a date literal (`=`, `<`, `<=`, `>`, `>=`), or `BETWEEN`. The period sets the years the loader loads.
- An `OR` when every branch filters the same column.
- The catalog tables without filters: `asset_coverage`, `load_runs` and `load_files`, and the `schema_version` table.
- `search_chunks(query, asset_id, document_type, section, mode)`: the full-text search. Its query is a literal string; `section` is NULL when no section is wanted; `mode` is `'text'`, the only mode for now (ADR 0023).

## What is refused

- A data table without its `asset_id` filter, with the filter to add named in the answer.
- An `asset_id` that is not `market:asset_type:code`, such as `PETR4` alone.
- An `asset_metrics` query without a `metric` filter.
- An `asset_filing_chunks` query without `document_type` or `filing_id`.
- A filter on another column that names the assets, such as a sector, a LIKE on `asset_id`, or a function over the column.
- A `metric` whose group is not one of the known groups (`statement`, `fundamental`, `fii`, `fund`, `macro`, `treasury`, `fx`).
- A filter that is a subquery, a value taken from another table, or one branch of an `OR` only.
- More than one statement, and any statement other than a `SELECT` (`PRAGMA`, `COPY`, `ATTACH`, and the rest).
- Table functions other than `search_chunks`, such as the file readers. `search_chunks` needs its five arguments, a literal query text and a mode the guard lists.

A join is accepted when each asset table in it has its own `asset_id` filter. The guard does not pass a filter from one table to another.

## Tests

`src/Services/SqlGuardService.test.ts` runs the cases above: 11 accepted with the requirements they must load, and 12 refused with the reason. The examples in `get_guide` (topic `sql`, `search`) are run by `src/Guides/GuideTexts.test.ts` against the schema, so a guide cannot teach a query the guard refuses.
