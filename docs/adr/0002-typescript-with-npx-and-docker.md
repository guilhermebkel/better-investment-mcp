# TypeScript, run with npx or Docker

The server is written in TypeScript on Node 22 and bundled into one file with tsup. A person runs it with `npx -y better-investment-mcp` or with a Docker image over stdio. The project was first called `better-investment-analysis-mcp` (`docs/adr/0026-the-project-is-named-better-investment-mcp.md`).

## Considered options

- Python: rejected. The harness this project reuses is TypeScript, the MCP SDK for TypeScript is well kept, and the author's other servers are TypeScript.
- A hosted service: rejected. The data cache is a local file and the server holds no account of the user; running it on the user's machine keeps it that way.

## Consequences

- One bundled file keeps `npx` fast. A native package (DuckDB) is the exception and stays external (`docs/adr/0008-duckdb-is-an-external-runtime-dependency.md`).
- Docker is for people who do not want Node on their machine; the packaging issue (#14) adds it.
