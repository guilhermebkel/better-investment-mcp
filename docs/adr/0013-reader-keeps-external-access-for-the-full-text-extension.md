# The reader keeps external access for the full-text extension, then locks it down; the store reaches one extension host

Date: 2026-11-08.

Issue #10 searches the documents with DuckDB's full-text extension (`fts`). The extension is loaded by DuckDB, not by an adapter, and the reader of ADR 0004 and issue #3 opened with external access disabled. DuckDB refuses to load any extension in that mode (`Loading external extensions is disabled through configuration`), so the search could not run. This ADR records the change and its limits.

## Decision

- The writer installs and loads the extension (`INSTALL fts`, `LOAD fts`) through `DuckDbAdapter.loadFullText()`. DuckDB downloads it from `extensions.duckdb.org`, the only host the store reaches (`DuckDbAdapter.EXTENSION_HOST`).
- The reader opens with external access on, loads `fts` if it is installed, and then locks the connection (`DuckDbAdapter.openReader()`):
  - `SET autoinstall_known_extensions = false` and `SET autoload_known_extensions = false`, so no query installs or loads another extension, and so no HTTP function (`read_csv` of a URL) loads `httpfs`.
  - `SET disabled_filesystems = 'LocalFileSystem'`, so no query reads a local file (`read_csv`, `read_text`) or attaches one (`ATTACH`, `COPY`).
  - The connection stays `READ_ONLY`, so no query writes.
- A failure to load `fts` on the reader is not an error for the store: only `search_chunks` fails, and the other queries run.
- Tested in `DuckDbAdapter.test.ts` (writes, local files, attach) and `integration/fulltext-search.integration.test.ts` (search results, the reader against a URL, an environment variable and a write; it installs the extension, so it runs with `pnpm test:integration`).

## Consequences

- ADR 0004 and issue #3 said that the connection has external access disabled. That is no longer true. The file and network functions are blocked by the settings above, not by DuckDB's external-access switch. The tests check each function named above.
- A query can no longer rely on the one switch. Any DuckDB function that reads the local file system, the network or the environment must be checked again when the DuckDB version changes, and a new test must cover it.
- The writer needs network access to `extensions.duckdb.org` the first time the extension is installed. On a machine without it, the first document load reports the index error (the chunks are still stored) and `search_chunks` stays unavailable until the extension can be installed. The extension is cached in the user's DuckDB directory afterwards.
- The host is a second network exception beside the data sources of ADR 0005 and the HTTP adapter's list. It is named here, and it is used by DuckDB, not by any data adapter.
