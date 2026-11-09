# Long loads continue in the background

Date: 2026-11-09.

A query waits for the loads it needs before it answers. A load of a CVM year, of a B3 year of quotes or of a report to index can take minutes, and the client waits with it. The first query on a new asset then looks like a hang.

## Decision

- A load that runs longer than `INVESTMENT_MCP_BACKGROUND_AFTER_SECONDS` (default 5, a positive integer) continues in the background. The query answers at once with the rows already stored, a warning that they may be incomplete, and the id of the load.
- The client follows the load by running the query again. While the load runs, the answer says so and gives its progress; once it has finished, the rows are complete. No tool is added for this.
- A request for the same requirements while a load runs shares that load and its id.
- The rule covers every category, because every load goes through the same loader.
- The answer never says a load is complete while it runs.
- Load ids are kept in memory by the server process. A load still running when the server stops is recorded in `load_runs` as interrupted the next time the store opens. Ids do not survive a restart.

## Consequences

- The answer of `query_sql` can be incomplete; the message names the loads still running. A client that needs the full data runs the query again after the load finishes.
- The tool count does not change.
- The cache file is written by a load while queries read it. This needs a test that a read during a load sees the rows already committed.
