# The vendor is recorded per load, not per row

Date: 2026-11-09.

Every data table had a `source` column, and every answer of `query_sql` named the vendor of the rows it read. A key (a ticker, a series, a CNPJ) is always written by one load, and a load replaces every row of its key, so the rows of one key never come from two vendors. The column repeated one fact in every row, and the answer exposed an operational detail.

## Decision

- The data tables have no `source` column. The loader drops a row's `source` key before it validates and writes the row.
- The vendor of a load is recorded once, in `cache_runs` (the `source` of the run). `cvm_files` keeps the identity of each file the CVM serves.
- The answer of `query_sql` does not name the vendor, nor whether a fallback served the load. It says what was loaded, its period and any error. `get_overview` does not name it either.
- The `asset_coverage` view does not show the vendor. `cache_runs` is still queryable and keeps it.

## Not decided here

- The meaning of a column that a vendor does not fill (for example `quotes.adj_close` from B3) is stated in `data-map.md`, not recorded per row.
