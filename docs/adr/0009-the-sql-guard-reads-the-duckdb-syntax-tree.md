# The SQL guard reads the syntax tree that DuckDB produces

The guard must know which tables a query reads and which filters it has before the query runs (`docs/adr/0006-the-query-must-filter-by-market-ticker-and-asset-type.md`). It parses the query with DuckDB's own parser, `json_serialize_sql`, which returns the statement as a JSON tree, and walks that tree. The engine that runs the query is the one that reads it, so a construct DuckDB accepts is one the guard sees.

## Considered options

- A second SQL parser for Node (a general one, or one for PostgreSQL): rejected. Its grammar differs from DuckDB's (for example `ATTACH`, `read_csv` and the `search_chunks` table function), so a query it accepts can still be one DuckDB runs differently. Two grammars cannot be kept in agreement.
- Regular expressions over the text of the query: rejected. A filter hidden in a subquery, a comment or an `OR` cannot be read reliably that way.

## Consequences

- The guard depends on the shape of `json_serialize_sql` (the node types `SELECT_NODE`, `BASE_TABLE`, `CONJUNCTION_AND` and the rest). Each shape it reads is checked by a schema in `src/Schemas/SqlGuardSchema.ts`, and the tests of `SqlGuardService` cover the cases. A DuckDB upgrade that changes the tree fails those tests.
- A statement that is not a single `SELECT` (`PRAGMA`, `COPY`, `ATTACH`, `INSTALL`, `LOAD`, `INSERT`) is refused by the parser before any rule runs, because `json_serialize_sql` only serializes a `SELECT`.
- The table functions (`search_chunks` and the file readers) are refused until their issue builds them.
