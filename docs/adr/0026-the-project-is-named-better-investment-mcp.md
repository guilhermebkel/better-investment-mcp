# The project is named better-investment-mcp

The project was first called `better-investment-analysis-mcp`. It is now `better-investment-mcp`.

## Decision

- The npm package, the `bin` command, the MCP server name, the Docker image (`ghcr.io/guilhermebkel/better-investment-mcp`) and the GitHub repository are `better-investment-mcp`.
- The config key written by `init` is `better-investment`, and the Docker cache volume is `better-investment-cache`.
- The environment variables keep the `INVESTMENT_MCP_` prefix, so nobody who already sets them has to change anything.
- `scripts/old-name.test.mjs` fails when a tracked file other than the ADRs, `CHANGELOG.md` and `pnpm-lock.yaml` still says `better-investment-analysis`.

## Why

The word "analysis" made the name long and suggested the server analyses. It gives data; the agent does the analysis. The short name matches `better-caprover-mcp`, the harness this project comes from (`docs/adr/0001-harness-from-better-caprover-mcp.md`).

## Consequences

- Nothing was published under the old name, so there is no deprecated package to maintain.
- GitHub redirects the old repository URL, but `git remote` should point to the new one.
