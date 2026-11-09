# No tool writes to the outside world, and the cache is a temporary file

No tool changes anything outside the server. Data that is missing is downloaded and indexed into a DuckDB file in the system temporary directory (or `INVESTMENT_MCP_CACHE_DIR`). Each load is valid for `INVESTMENT_MCP_CACHE_TTL_SECONDS`. The file can be deleted without loss. Queries open it read-only with external access (files, network) disabled.

## Considered options

- Write tools (add an asset, refresh the cache by hand): rejected. The server loads what a query needs, so the agent never has to ask for a load.
- A persistent database that the user manages: rejected. It would hold a copy of CVM data, and it would need migration and backup rules.

## Consequences

- There are no access modes, no risk tiers and no confirmation steps; the read-only rule is in the connection and in the SQL guard.
- The first query for an asset is slower because it loads the data. The `loaded` report says what was loaded.
- The repository never ships a cached database.
