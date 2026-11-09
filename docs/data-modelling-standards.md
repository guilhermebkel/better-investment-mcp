# Data modelling standards

How the data the server keeps is named and shaped, for any new table or column. Each rule is one line a reviewer or a tool can answer yes or no. The check says how: `test` (a test enforces it), `review` (a reviewer checks it on the pull request). The model these rules produce is in `docs/product/data-model.md`.

## Tables

- Table names are plural and snake_case. Check: review.
- A table about an asset starts with `asset_` (`asset_quotes`, `asset_metrics`). Check: review.
- A control table about a load starts with `load_` (`load_runs`, `load_files`). Check: review.
- A table holds one kind of fact. A new kind of fact is a new table only when no existing table's key and shape fit it. Check: review.
- A value that is a number observed over time goes in `asset_metrics` as a row, not as a column. Check: review.
- A table has no column per vendor, and the vendor is not a column of a data table. The vendor of a load is recorded once, in `load_runs`. Check: test.
- Every data table has a primary key, and the key is the one the rows are replaced by. Check: test.

## Asset identity

- An asset has one `asset_id` of the form `market:asset_type:code`, for example `BR:stock:PETR4`, `BR:tax_rate:SELIC`, `BR:fund:00.017.024/0001-53`. Check: review.
- `asset_type` is also a column of the `asset` table, so it can be filtered and grouped without reading the id. Check: review.
- A code is the code the publisher uses, in upper case. Characters other than `A-Z`, `0-9`, `.`, `/`, `-` and `_` are replaced by `_`, and the mapping is written in the data map. Check: review.
- Every table about an asset is keyed by `asset_id`, not by market and ticker. Check: test.
- A query reads an asset table only with a filter on `asset_id` (equal or in a list). Each asset table in a query has its own filter: a join does not pass the filter of one table to the other. A filter on another column does not say which assets to load, so it is refused. Check: test.

## Time

- Every column that says when a row's facts hold is a pair: `reference_time_start` and `reference_time_end`, both DATE, inclusive. A day has both equal; a month, a quarter, a year or a year-to-date has them at its first and last day. Check: test.
- An event is a single date with its own name: `ex_time`, `payment_time`, `survey_time`, `published_at`. Check: review.
- A publication or delivery moment is a TIMESTAMP with the time zone of the source. Check: review.
- Dates are stored as DATE or TIMESTAMP, never as text. Check: test.

## Values

- A numeric observation has a `metric` and a `value` in long form, with `unit` on the same row. Check: review.
- A metric name is `group.name`, lower case, with the group the source area: `fundamental.roe`, `fund.quota`, `statement.dre_con.3_01`, `macro.value`. Check: review.
- A metric's unit is the same in every row of that metric. Check: review.
- A column that a vendor does not fill is null, never zero. Check: review.

## Keys and rows

- The loader writes a key (an `asset_id`, a series, a CNPJ) from one load, and a load replaces every row of its key. Check: review.
- A provider's category names the contract it fills, not a table. A category may fill several tables. Check: review.
- Column names are English, in full, without abbreviations that a reader would not know. Check: review.

## Adding data

Before adding a table or a column:

1. Decide whether the fact is about an asset. If yes, it uses `asset_id` and an `asset_` table.
2. Decide whether it is a number over time. If yes, it is a metric row in `asset_metrics`, with a name, a unit and the time pair.
3. Decide whether it is a document or part of one. If yes, it is linked by `filing_id`.
4. Write the rule that makes the new table different from the existing ones, in the data map, before the code.
