export const LIMITS_GUIDE = `# Limits guide

## Answers

- An answer returns at most 1,024 rows and 50,000 characters. A cut is always reported with the number of rows and characters left out. Narrow the query to get the rest.
- One query loads at most 50 assets. Filter fewer tickers when a query asks for more.

## Cache

- Loaded data is kept in a local DuckDB file, valid until the time that get_overview reports.
- A load runs the first time a query asks for an asset, or after its time is over.
- The server keeps only its own cache file. Deleting it loses nothing: the next query loads the data again.

## Offline

- Data already loaded works offline until its time is over.
- A load that needs a vendor fails when the vendor does not answer. The answer names the vendor and the cause, and the previous rows stay.
- A vendor that blocks or limits requests is reported with its status. The StatusInvest adapter retries a 403 twice, five seconds apart, then stops. Wait before you retry the load; the server does not retry in a loop.

## See also

- sources: which vendor serves what.
- sql: the filter rule.
`;
