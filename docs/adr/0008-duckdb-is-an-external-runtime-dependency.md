# DuckDB is an external runtime dependency

The cache and the query engine are one DuckDB file (`docs/adr/0003-all-data-is-read-through-one-sql-tool.md`). DuckDB's Node package is native: it loads a platform binding (`@duckdb/node-bindings-linux-x64`, `...-darwin-arm64` and the others) that a bundler cannot inline. So `@duckdb/node-api` is declared as a runtime dependency and kept external in `tsup.config.ts`; the package and its bindings are installed with the server.

## Considered options

- Bundle it into `dist/main.js` with the rest: rejected. The bundler tries to resolve every platform binding and fails on the ones it cannot read.
- A pure JavaScript store (an in-memory table, or a JSON file): rejected. The SQL tool needs a real SQL engine with the read-only and external-access switches of `docs/adr/0004-no-tool-writes-to-the-outside-world.md`.
- Another native database (SQLite): rejected for the same packaging reason and because DuckDB has the analytic functions the agent queries use.

## Consequences

- `npx` downloads the platform binding with the package. The tarball is checked to install and start on a clean directory (issue #14).
- `pnpm check:licenses` checks the licenses of the runtime dependencies as well as the bundled packages, so an external package is never missed.
- The Docker image must carry the same dependencies (issue #14).
- The reader is opened per query, because a DuckDB connection keeps the data it saw when it was opened (`src/Adapters/DuckDb/DuckDbAdapter.ts`).
