# Docker runs the same program, over stdio or over HTTP

The image runs the package that npm publishes, so `npx` and Docker run the same code. The transport the server speaks is a setting, not a second image.

## Decision

- **stdio** (the default). A client starts `docker run -i --rm` and talks over stdin and stdout, as it does with `npx`.
- **HTTP** when `INVESTMENT_MCP_TRANSPORT=http`. The server listens on `INVESTMENT_MCP_HTTP_HOST` and `INVESTMENT_MCP_HTTP_PORT` (`127.0.0.1:3100` by default) with Streamable HTTP at `/mcp`, and `GET /health` answers `ok`. A bearer token (`INVESTMENT_MCP_HTTP_TOKEN`, at least 8 characters) is required on every address, and every `/mcp` request must send it.
- **Health.** The image's `HEALTHCHECK` runs `better-investment-mcp health`. Over stdio it passes at once; in HTTP mode it probes `GET /health`. The mode comes from the environment, not from a marker file.
- **One test for both.** `scripts/package-smoke.mjs` runs the stdio check and then the HTTP check: `/health`, the token, the three tools, and 401 without a token. CI runs it on the built image in both modes.

## Considered options

- A marker file, written when HTTP starts, so that the health check knows the mode: rejected. It is a write outside the cache file, which `docs/adr/0004-no-tool-writes-to-the-outside-world.md` forbids.
- Two images, one per transport: rejected. One image serves both, and the setting decides.
- An optional token on localhost: rejected. Without a token every `/mcp` call answers 401, so HTTP mode would be useless; requiring the token everywhere is simpler to reason about.
- Rate limits and a concurrency limit for HTTP: not built. They can come later as their own issue.

## Consequences

- The image runs as `node` in both modes, and the cache is the `/cache` volume.
- The server does not terminate TLS. Exposing HTTP beyond localhost needs a reverse proxy with TLS in front of it.
- The stdio example and the HTTP example use the same image; only the environment differs.
