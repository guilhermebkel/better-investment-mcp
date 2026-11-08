export const SOURCES_GUIDE = `# Sources guide

Each row keeps the source that produced it, in the source column. Each answer also names what was loaded, from which source, and whether a fallback served it.

## Which vendor serves what

- Yahoo Finance (source yahoo): quotes, splits, dividends and the asset summary (assets) for BR and US tickers. Unofficial, for personal use, no service guarantee.
- BCB SGS (source bcb): macro_series for the series ipca, cdi, selic and ptax. Open data.
- StatusInvest (source statusinvest): fundamentals and fii_monthly. The site may block the requests; a blocked load says so and writes nothing.
- CVM (source cvm): filings for a company, from the yearly IPE file. Open data under ODbL. Filing types: material_fact, sustainability and other. Not every ticker has a CVM company yet.

## Quality columns

- quotes.is_stale: the price repeats the day before with zero volume.
- quotes.suspect_tick: one day moved more than 25% and came back within 5% the next day. The row stays.
- adj_close is the vendor's adjusted close; use it for returns across splits and dividends.

## Units

- macro_series.value: ipca is percent per month, cdi is percent per day, selic is percent per year, ptax is BRL per USD.
- Amounts are plain numbers in currency units.

## See also

- sql: the tables and the filter rule.
- limits: what the server keeps and for how long.
`;
