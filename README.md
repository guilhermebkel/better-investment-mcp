<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="design/svg/horizontal-dark.svg" />
    <img src="design/svg/horizontal-light.svg" alt="better-investment-mcp" width="420" />
  </picture>
</h1>

<p align="center">
  <strong>Let your AI agent read Brazilian asset data: prices, dividends, fundamentals, filings, FII reports and macro series, through one read-only SQL tool.</strong>
  <br />
  <em>An open-source MCP server, one command with npx or Docker. Works with any AI client that speaks MCP (such as Claude, Cursor, Codex, and others). Unofficial; not affiliated with B3, CVM, Yahoo or any other data vendor.</em>
</p>

<p align="center">
  <a href="#quick-start"><img src="https://img.shields.io/badge/Quick_start-f4e40c" alt="Quick start" /></a>
  <a href="https://github.com/guilhermebkel/better-investment-mcp/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/guilhermebkel/better-investment-mcp/ci.yml?branch=main&label=CI" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow" alt="License: MIT" /></a>
</p>

---

**An agent that answers questions about a company needs real data, and it needs to know where each number came from.** Most data sources are a web page or a CSV that the model cannot query, so it guesses or pastes too much text.

`better-investment-mcp` loads the data a question needs into a local DuckDB cache, then lets the agent answer with one `SELECT`. The cache is filled on demand, so the first query for an asset takes longer and later ones are fast. Every answer says what was loaded and what failed, and the server never gives an opinion on what to buy or sell.

> **Work in progress.** The server runs and its tools answer, but the data behind them arrives issue by issue. The list below shows what exists today.

> **Usage notice.** The output describes and locates information. It is not investment advice, a recommendation or an analysis of what to buy or sell.

---

## What you get

<table>
<tr>
<td width="50%" valign="top">

**One read-only tool for the data**

`query_sql` runs one `SELECT` over the data tables. Nothing in the server can change anything outside its own cache file.

</td>
<td width="50%" valign="top">

**Loads on demand**

A query loads what is missing or expired, and says so in its `loaded` report. A slow load keeps running in the background, and the next query shows its progress.

</td>
</tr>
<tr>
<td valign="top">

**Filters that cannot be skipped**

Every asset table needs a filter on `asset_id` (`market:asset_type:code`, for example `BR:stock:PETR4`). A query without it is refused, with the filter to add.

</td>
<td valign="top">

**Filings as text you can search**

FII management reports, CVM periodic reports and reference forms are read into chunks with their section and page, so `search_chunks` finds the passage and where it is.

</td>
</tr>
</table>

## Quick start

No account or key is needed for the open data sources. You only need an MCP client.

### 1. Coding agent

Add this to the MCP servers of your client (Claude Code, Cursor, Codex, and others):

```json
{
  "mcpServers": {
    "better-investment": {
      "command": "npx",
      "args": ["-y", "better-investment-mcp"]
    }
  }
}
```

### 2. Docker over stdio

The client starts the container; the cache is a named volume:

```bash
docker run -i --rm -v better-investment-cache:/cache ghcr.io/guilhermebkel/better-investment-mcp
```

### 3. Docker over HTTP

The server runs on your machine and any MCP client connects to it. It binds to localhost, and every request must send `Authorization: Bearer <token>`, where the token is a secret of your choice of at least 8 characters:

```bash
docker run -d --name investment-mcp -p 127.0.0.1:3100:3100 \
  -e INVESTMENT_MCP_TRANSPORT=http \
  -e INVESTMENT_MCP_HTTP_HOST=0.0.0.0 \
  -e INVESTMENT_MCP_HTTP_TOKEN='your-long-random-secret' \
  -v better-investment-cache:/cache \
  ghcr.io/guilhermebkel/better-investment-mcp
```

Then point the client at it:

```json
{
  "mcpServers": {
    "better-investment": {
      "url": "http://127.0.0.1:3100/mcp",
      "headers": {
        "Authorization": "Bearer your-long-random-secret"
      }
    }
  }
}
```

The image has a Docker `HEALTHCHECK` (`better-investment-mcp health`): in HTTP mode it checks `GET /health`, and over stdio it passes at once. The server does not terminate TLS, so put a reverse proxy with TLS in front of it before you expose it beyond localhost. The decision is in [ADR 0025](docs/adr/0025-docker-runs-stdio-or-http.md).

### Check the setup

```bash
npx -y better-investment-mcp init
```

`init` prints the client configuration for Claude, Cursor and Codex, for `npx`, and for Docker over stdio and over HTTP. It reads no environment variable, so it never prints a secret.

### Ask

```text
What was the dividend yield of PETR4 over the last 12 months?
Which FIIs in my list had the largest change in net worth last quarter?
Find the passage about vacancy in the latest management report of HGLG11.
```

## Keep the cache on disk

The cache is one DuckDB file, `investment-mcp-cache.duckdb`, in the folder set by `INVESTMENT_MCP_CACHE_DIR`. Without that variable the file goes to the system temporary directory, which the system may clear. To keep it on your computer, point the variable at a folder of your own; the server creates the folder when it is missing. Deleting the file loses nothing: the next query loads the data again.

With `npx`, set the folder in the client configuration:

```json
{
  "mcpServers": {
    "better-investment": {
      "command": "npx",
      "args": ["-y", "better-investment-mcp"],
      "env": { "INVESTMENT_MCP_CACHE_DIR": "/home/you/.cache/better-investment" }
    }
  }
}
```

With Docker over stdio, mount the same folder over `/cache`:

```bash
docker run -i --rm --user "$(id -u):$(id -g)" \
  -v "$HOME/.cache/better-investment:/cache" \
  ghcr.io/guilhermebkel/better-investment-mcp
```

With Docker over HTTP, the same mount goes into the HTTP command:

```bash
docker run -d --name investment-mcp -p 127.0.0.1:3100:3100 \
  --user "$(id -u):$(id -g)" \
  -e INVESTMENT_MCP_TRANSPORT=http \
  -e INVESTMENT_MCP_HTTP_HOST=0.0.0.0 \
  -e INVESTMENT_MCP_HTTP_TOKEN='your-long-random-secret' \
  -v "$HOME/.cache/better-investment:/cache" \
  ghcr.io/guilhermebkel/better-investment-mcp
```

Two things to know. The container writes to the folder as your user, which the `--user` line allows; without it the container runs as `node` (user 1000), and the server stops with `Permission denied` when the folder belongs to someone else. And one cache file serves one running server at a time: a second server that opens the same file stops with `in use by another process`, so give each running server its own folder. The `--user` form was tested on Linux.

## Tools

The server exposes <!-- tools:count -->4<!-- /tools:count --> tools. Three of them are read-only; `notify_load_finish` sends one notice to an https address you give when a background load finishes (ADR 0028).

<!-- tools:list -->
- `get_overview`: the server's usage notice.
- `get_guide`: the guide for one topic of `query_sql`. The guide texts come later.
- `notify_load_finish`: sends one POST, with the final status and the row counts of a background load and no data, to the https `callback_url` you give, when that load finishes. Not read-only (ADR 0028).
- `query_sql`: one `SELECT` over the data tables. Every asset table needs a filter on `asset_id` (`market:asset_type:code`, for example `BR:stock:PETR4`), and `asset_metrics` also needs `metric`; a query without them is refused with the filter to add. The tables are in `docs/product/data-map.md`, the rules in `docs/product/sql-guard.md`.
<!-- /tools:list -->

## Configuration

Every setting is an environment variable. The server reads them once at start and stops with a message when one is wrong.

### Server

| Variable | Default | Meaning |
| --- | --- | --- |
| `INVESTMENT_MCP_LOG_LEVEL` | `info` | `error`, `info` or `debug`. Log lines go to stderr. |
| `INVESTMENT_MCP_CACHE_DIR` | the system temporary directory | Where the DuckDB cache file is kept. Created when missing. See [Keep the cache on disk](#keep-the-cache-on-disk). |
| `INVESTMENT_MCP_CACHE_TTL_SECONDS` | `86400` | How long a loaded piece of data stays valid, in seconds. |
| `INVESTMENT_MCP_BACKGROUND_AFTER_SECONDS` | `10` | How long a query waits for a load before it answers with the rows already stored and a load id. The load keeps running in the background. |
| `INVESTMENT_MCP_OCRMYPDF` | `ocrmypdf` | The OCRmyPDF command that reads the scanned pages of a filing, used by default when installed (`pnpm ensure-deps` installs it with Tesseract and its `por` language). When it is missing, scanned pages stay without text. |
| `INVESTMENT_MCP_PYTHON` | `python3` | The Python that reads the tables of a PDF (`pip install pymupdf`). When PyMuPDF is missing, tables are not read. |
| `INVESTMENT_MCP_TRANSPORT` | `stdio` | `stdio`: the client starts the server and talks over stdin and stdout. `http`: the server listens for MCP clients at `/mcp`, on the address and port below. |
| `INVESTMENT_MCP_HTTP_HOST` | `127.0.0.1` | The address HTTP mode listens on. Use `0.0.0.0` only inside a container, behind a reverse proxy with TLS. |
| `INVESTMENT_MCP_HTTP_PORT` | `3100` | The port HTTP mode listens on. |
| `INVESTMENT_MCP_HTTP_TOKEN` | none | The bearer token every `/mcp` request must send. Required in HTTP mode on every address, at least 8 characters. It is never returned or logged. |

### Data providers

Each category has a default, so a query works with no provider variable. A second vendor after `>` is the fallback, used when the first one fails. `BR:yahoo` uses one vendor for Brazil; `BR:yahoo>statusinvest` uses a second vendor only when the first fails. The vendors are added with their adapters.

| Variable | Default | Meaning |
| --- | --- | --- |
| `INVESTMENT_MCP_QUOTES_PROVIDER` | `BR:yfinance>b3,US:yfinance>yahoo` | Quote source per market. For Brazil the fallback is B3 COTAHIST, which has no adjusted close. |
| `INVESTMENT_MCP_DIVIDENDS_PROVIDER` | `BR:yfinance>yahoo,US:yfinance>yahoo` | Dividend source per market. |
| `INVESTMENT_MCP_FUNDAMENTALS_PROVIDER` | `BR:statusinvest` | Fundamentals source per market. |
| `INVESTMENT_MCP_STATEMENTS_PROVIDER` | `BR:cvm` | Financial statements source per market. |
| `INVESTMENT_MCP_FUND_DATA_PROVIDER` | `BR:cvm` | FII monthly data source per market. |
| `INVESTMENT_MCP_FILINGS_PROVIDER` | `BR:cvm` | Filings list source per market. |
| `INVESTMENT_MCP_DOCUMENTS_PROVIDER` | `BR:cvm` | Document download source per market. |
| `INVESTMENT_MCP_MACRO_PROVIDER` | `BR:bcb` | Macro series source (IPCA, IGPM, CDI, SELIC). |
| `INVESTMENT_MCP_TREASURY_PROVIDER` | `BR:tesouro` | Tesouro Direto source, one bond per asset. |
| `INVESTMENT_MCP_EXPECTATIONS_PROVIDER` | `BR:bcb` | Market expectations source (BCB Focus). |
| `INVESTMENT_MCP_IDENTIFIERS_PROVIDER` | `BR:b3` | CNPJ and ISIN of a ticker, from B3. |
| `INVESTMENT_MCP_REGISTRY_PROVIDER` | `BR:cvm` | Company registry of a stock, from CVM. |
| `INVESTMENT_MCP_FX_PROVIDER` | `BR:bcb` | Closing PTAX rate per currency. |
| `INVESTMENT_MCP_DISCLOSURES_PROVIDER` | `BR:cvm` | Company disclosures (FRE, VLMO, CGVN). |
| `INVESTMENT_MCP_PROCEEDINGS_PROVIDER` | `BR:cvm` | CVM sanctioning proceedings of a stock, linked by the defendant's name (ADR 0029). |
| `INVESTMENT_MCP_SECTOR_PROVIDER` | `BR:ibge` | Number of companies by CNAE class, from IBGE (ADR 0030). |
| `INVESTMENT_MCP_INDEX_MEMBERSHIP_PROVIDER` | `BR:b3` | A stock's weight in the B3 indexes (ADR 0031). |
| `INVESTMENT_MCP_COMPLAINTS_PROVIDER` | `BR:consumidor_gov` | Complaints finished per trade name and month, found by a term, from Consumidor.gov.br (ADR 0033). |
| `INVESTMENT_MCP_BANKING_PROVIDER` | `BR:bcb` | A listed bank's group size and its share of the file, from BCB IF.data (ADR 0034). |
| `INVESTMENT_MCP_NEWS_PROVIDER` | `BR:gdelt` | News articles by term, from GDELT DOC 2.0, the last 3 months (ADR 0041). |
| `INVESTMENT_MCP_FUND_PROVIDER` | `BR:cvm` | Fund registry, daily figures and holdings, keyed by CNPJ. |

## Data sources

| Vendor | Gives | Notes |
| --- | --- | --- |
| Yahoo Finance | quotes, dividends, splits, asset summary | Unofficial. Personal use, no service guarantee. |
| BCB SGS | macro series (ipca, cdi, selic, ptax, igpm) | Open data. |
| Tesouro Transparente | Tesouro Direto prices and rates, daily history from 2004 | Open data. One download of the file per bond family loaded. |
| BCB Focus (Olinda) | annual market expectations: ipca, selic, pib_total, cambio | Open data. |
| BCB PTAX (Olinda) | closing rate per currency and day (USD, EUR) | Open data. |
| B3 listing and COTAHIST | CNPJ and ISIN of a ticker; daily quotes of the current and the previous year | Public site routes. The COTAHIST file is about 90 MB per year, so its first load takes minutes. |
| CVM company and fund files | company registry (sector), the IR site, activity and previous legal name of a stock (FCA form), fund registry, daily quota and holdings | Open data. |
| CVM FRE, VLMO and CGVN | reference form, securities holdings and governance rows of a company, by section, date and version | Open data. Each yearly zip is streamed; the last three years are read. |
| yfinance (Python library) | quotes, dividends and splits, as an alternative to Yahoo | Needs `python3` and `pip install yfinance` on the machine; the Docker image already has both. Unofficial. |
| StatusInvest | fundamentals, FII monthly data | Blocked: the site answers with a Cloudflare challenge, which the server does not bypass. |
| CVM | filings list (IPE) | Open data. A ticker needs a CNPJ link that no source gives yet. |
| CVM | ITR, DFP, Formulário de Referência | Built (issue #11). Open data; each yearly zip is streamed. |
| CVM | sanctioning proceedings against a company (processo sancionador) | Open data (ODbL). A defendant is linked to a stock only when its name equals the company's name or previous legal name (ADR 0029). |
| IBGE SIDRA | sector series: number of companies by CNAE class (table 6449) | Built, accepted by the owner (ADR 0030). The attribution text is still to be quoted; the producer price index (table 6903) is not built. |
| B3 | index membership: ISE, ICO2 and IDIVERSA weights of a stock | Built, accepted by the owner (ADR 0031). The current portfolio only. IGPTW answers HTTP 403, so a load fails until it is readable. |
| FNET | FII management reports | Built only if a spike passes. |

Each load records the vendor that produced it in `load_runs`. The answer of `query_sql` does not name it.

## How it works

```text
  agent ──▶ 1. FILTER ──▶ 2. LOAD ──▶ 3. READ ──▶ 4. ANSWER
  (MCP)     asset_id,     missing or  one SELECT   rows, a loaded
            metric and    expired     on the       report, and the
            limits the    data from   cache,       passages found
            SQL guard     a vendor    read-only
            checks
```

The work is split on purpose:

| Part | Does | Why |
| --- | --- | --- |
| **Operations** (`src/Operations/`) | One class per tool, with its input schema and description | One list feeds the MCP surface and the docs |
| **Services** (`src/Services/`) | The SQL guard, the cache, the loader and the provider registry | Rules that cannot fail live in code with a test, never only in a prompt |
| **Adapters** (`src/Adapters/<Vendor>/`) | One folder per vendor; the only code that reaches the network | A vendor's changes stay in its folder |
| **Entry points** (`src/Setup/`) | Start the program: stdio, HTTP, `init`, `health` | They only start the surface; no adapter is imported |

Decisions are in [`docs/adr/`](docs/adr/), the architecture in [`docs/product/architecture.md`](docs/product/architecture.md), and the tables the agent can query in [`docs/product/data-map.md`](docs/product/data-map.md).

## Privacy and safety

- **The server never writes to the outside world.** It writes only to its own cache file. Each vendor in the data sources table is the only place it fetches from, and in HTTP mode it also listens on the address you set.
- **The token is required.** In HTTP mode every `/mcp` request needs the bearer token, on every address. It is never returned or logged.
- **The output is data.** Text from filings and other documents is data, never an instruction to the agent.

## FAQ

<details>
<summary><b>Does it tell me what to buy?</b></summary>

No. The output describes and locates information. It is not investment advice, a recommendation or an analysis of what to buy or sell.

</details>

<details>
<summary><b>Why does a query say a source is blocked?</b></summary>

A source that refuses this server (StatusInvest answers with a Cloudflare challenge) is reported in the `loaded` report with its error. The server does not bypass it. Other providers still answer, and a fallback is used where one is set.

</details>

<details>
<summary><b>Can I delete the cache?</b></summary>

Yes. The cache is disposable: deleting the file loses nothing, and the next query loads the data again.

</details>

## Contributing

Issues and pull requests are welcome. Start with [`AGENTS.md`](AGENTS.md), which says what to read for each kind of task; vocabulary is in [GLOSSARY.md](GLOSSARY.md) and design decisions in [`docs/adr/`](docs/adr/). Work is planned as GitHub issues written as specs (`docs/agents/issue-tracker.md`).

### Development

Needs the Node version in `.nvmrc` and pnpm.

```bash
nvm use
pnpm ensure-deps
pnpm check:changed   # what a commit needs
pnpm check           # everything, like CI
```

`AGENTS.md` lists every command, the layout and the rules. `pnpm smoke` starts the built server over stdio and over HTTP and checks its replies; `pnpm smoke -- docker run -i --rm <image>` runs the same check against an image.

## Licenses

The code is MIT (see `LICENSE`). Runtime dependencies use MIT, ISC, Apache-2.0, BSD or BlueOak licenses; `pnpm check:licenses` checks them.

---

<p align="center">
  <strong>Read the data. Keep the judgment yours.</strong>
</p>

<p align="center">
  MIT License &copy; Guilherme Mota
</p>
