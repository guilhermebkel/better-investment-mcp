# asset_id is the query key

Date: 2026-11-09.

ADR 0006 required a query to filter by market, ticker and asset type. Each table then carried those three columns as its key, and the series and the funds used keys of their own. The same asset was named in different ways by different tables, and a query on a sector could not say which assets to load.

## Decision

- An asset has one `asset_id` of the form `market:asset_type:code`, for example `BR:stock:PETR4`, `BR:tax_rate:SELIC`, `BR:fund:00.017.024/0001-53`. The codes follow `docs/data-modelling-standards.md`.
- The guard requires a filter on `asset_id` (equal or in a list) on every asset table. Each asset table in a query has its own filter: a join does not pass the filter of one table to the other, so a join filters both sides. A filter on another column does not name the assets to load, so the query is refused.
- A category is a loader contract (the provider that fills it), not a table. A category may fill several tables.
- The rule of ADR 0006 that a query names its assets is kept; the columns that name them change.

## Consequences

- The keys of the data tables become `asset_id` plus the time or the metric.
- The series, the funds and the currencies are assets, so they are queried the same way as a stock.
