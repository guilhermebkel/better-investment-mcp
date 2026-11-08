# The SQL guard

`query_sql` runs a query only after the guard accepts it. The guard reads the query with DuckDB's parser (`docs/adr/0009-the-sql-guard-reads-the-duckdb-syntax-tree.md`) and lists the assets it needs. A query the guard cannot read is refused with the table, the missing filter and a corrected example.

## What is accepted

- One `SELECT` statement, with `WITH`, subqueries, joins, `UNION`, window functions and aggregations.
- Every data table filtered by `market`, `ticker` and `asset_type`, each compared with `=` or `IN` against literal text. The literal may be on either side of `=`.
- A table filtered in a `WHERE` or in a join condition. Each side of a join needs its own filters.
- An `OR` when every branch filters the same column, for example `ticker = 'PETR4' OR ticker = 'VALE3'`.
- `macro_series` filtered by `series`.
- `chunks` filtered by `market`, `ticker`, `asset_type` and `filing_type` or `filing_id`.
- Catalog tables without filters: `assets`, `cache_runs`, `asset_coverage` and `schema_version`.
- At most 50 assets in one query.

## What is refused

- A data table without one of its filters, in any `SELECT` of the query, including inside a CTE or a subquery.
- A filter that is a function over the column (`lower(ticker) = 'x'`), a subquery (`ticker = (SELECT ...)`), or a value taken from another table.
- An `OR` that does not filter the column in every branch.
- `document_text`: it has no market or ticker column. Query `chunks` instead.
- Table functions (`search_chunks` and the file readers) until their issues build them.
- More than one statement, and any statement that is not a `SELECT`: `PRAGMA`, `COPY`, `ATTACH`, `INSTALL`, `LOAD`, `INSERT`, `CREATE`.
- A syntax error.
- A `WITH` name that is the name of a data table.

The connection itself is read-only with external access disabled (`docs/adr/0004-no-tool-writes-to-the-outside-world.md`), so a query that gets past the guard still cannot write or read a file.

## Not yet done

- The date range of a query is not read; the loader loads the whole asset.
- Filters on `chunks` do not narrow the documents loaded; the document loader comes with `search_chunks` (issue #10).

## Measured result

The guard's tests run 32 queries: 15 accepted with the requirements they must load, and 17 refused with the reason. All 32 gave the expected verdict on the last run (`src/Services/SqlGuardService.test.ts`). The 32 cover each acceptance and refusal rule above, the forbidden statements, and the edge cases of the issue (a function over the ticker, a subquery as the ticker, an `OR` that hides the ticker).
