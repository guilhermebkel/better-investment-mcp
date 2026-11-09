# better-investment-analysis-mcp

An MCP server that gives AI agents data on Brazilian assets through one read-only SQL tool. Unofficial; not investment advice.

Terms marked *planned* have no code yet; they are the vocabulary the docs already use.

## Language

**Asset**:
A thing with a price or a report: a stock, an FII, a fund, an index, a currency or a Treasury bond. It is identified by its `asset_id`, `market:asset_type:code` (for example `BR:stock:PETR4`).
_Avoid_: security, instrument, position (a position is what a person holds, which is out of scope)

**Market**:
The country exchange of an asset, such as `BR` or `US`. Only `BR` has providers today.
_Avoid_: exchange, country

**Asset type**:
One of `stock`, `fii`, `fund`, `etf`, `bdr`.
_Avoid_: class, category (category means a data category)

**FII**:
A Brazilian real estate investment fund (fundo de investimento imobiliário) listed on B3.

**Tool**:
What the client sees: `get_overview`, `get_guide` or `query_sql`. A tool is exposed by one operation.
_Avoid_: endpoint, command

**Operation**:
A class in `src/Operations/` that implements a tool. It has a name, a strict input schema and a description. All operations are read-only.
_Avoid_: action, handler

**Manifest** (*planned*):
The single list of operations, `src/Surfaces/OperationManifestSurface.ts`. The surface reads it.
_Avoid_: catalog, registry

**Surface**:
The code that exposes the operations over MCP.

**Transport**:
How a client reaches the server: `stdio` (the client starts the process and talks over stdin and stdout) or `http` (the server listens on a port and a client sends its requests to `/mcp`). It is set by `INVESTMENT_MCP_TRANSPORT`.
_Avoid_: mode (the server has no access modes; every operation is read-only)

**HTTP token**:
The bearer secret (`INVESTMENT_MCP_HTTP_TOKEN`) that every request to `/mcp` must send in the `Authorization` header in HTTP mode. It is never returned or logged.
_Avoid_: password, API key

**Health check**:
The `health` command. Over stdio it passes at once; in HTTP mode it passes when `GET /health` answers `ok`. The image's Docker `HEALTHCHECK` runs it.

**Provider**:
An interface for one category of data, such as `QuoteProvider`. It declares which markets and asset types it serves.
_Avoid_: source (a source is the vendor), client

**Adapter**:
The code that talks to one vendor, such as Yahoo Finance, and implements one or more providers. It is the only code that reaches the network.

**Vendor**:
An outside service that has data: Yahoo Finance, StatusInvest, CVM, FNET or BCB.

**Source**:
The vendor that produced a load. It is recorded once per load, in `load_runs`, and is not a column of the data tables (ADR 0020).

**Data category**:
A kind of data with its own provider: quotes and splits, dividends, fundamentals, financial statements, periodic fund data, filing list, document text, macro, Tesouro Direto prices and market expectations.

**Cache**:
The temporary DuckDB file the server fills on demand. It can be deleted without loss. Its location is `INVESTMENT_MCP_CACHE_DIR` and its time to live is `INVESTMENT_MCP_CACHE_TTL_SECONDS`.
_Avoid_: database, store (the store is the code that manages the cache)

**Load**:
Downloading data from a vendor and writing it into the cache before a query runs.

**Run**:
One load of one category for one asset, recorded in `load_runs` with its start, end, expiry, rows and error.

**Freshness**:
Whether a run has not expired yet. A fresh run is not loaded again.

**SQL guard**:
The code that reads a query before it runs, checks the filters and refuses what it cannot understand.

**Loaded report**:
The `loaded` part of a `query_sql` answer: per category and asset, the status, the rows, the period and the error if any. It does not name the source.

**Filing**:
A document a company or fund delivers to the regulator: a quarterly report (ITR), an annual statement (DFP), a reference form (FRE), a material fact, an FII management report.

**Chunk**:
A piece of the text of a filing with its section and page, searchable by full text.

**Full-text index**:
The BM25 index over the chunks, built with DuckDB's full-text extension after each load that changed a chunk. Rules in `docs/product/search.md`.

**ITR**, **DFP**, **FRE**:
The quarterly report, the annual statement and the reference form (Formulário de Referência) of a listed company, as CVM publishes them.

**CVM**:
The Brazilian securities regulator (Comissão de Valores Mobiliários).

**FNET**:
The system where FII documents are published.

**Usage notice**:
The statement in `get_overview` that the output describes and locates information and is not investment advice.

## Data quality

**Stale**:
A quote row whose close repeats the day before with zero volume. The row is flagged, never removed.
_Avoid_: missing, empty

**Suspect tick**:
A quote row that moved more than 25% in one day and came back within 5% the next day. The row is flagged, never removed.
_Avoid_: error, outlier (the row is kept)

**Series**:
A macro series such as `ipca`, `cdi`, `selic`, `ptax` or `igpm`. It has no market; its registry market is `SERIES`.
_Avoid_: indicator, index

**Bond family**:
A Tesouro Direto group of bonds that the file names alike, such as `Tesouro Selic` or `Tesouro IPCA+`. It is the code of a Treasury asset: its family and its maturity (`TESOURO_SELIC_2027-03-01`). Its prices are rows of `asset_metrics` with the `treasury.` metrics.
_Avoid_: product, bond type

**Fund key**:
The CNPJ of a fund class. It is the code of a fund asset (`BR:fund:<CNPJ>`), in `asset`, `asset_attribute`, `asset_metrics` (`fund.`) and `asset_holdings`. CVM's fund files cover FI, FIDC and FIF, not FII.
_Avoid_: fund ticker

**Focus**:
The BCB survey of market expectations. `asset_expectations` holds its annual mean and median for `ipca`, `selic`, `pib_total` and `cambio`, one row per survey date and calculation base.
_Avoid_: forecast, projection

## CVM open data

**Reference period**:
The period a row refers to: `period_end` for statements, `period` for FII monthly data, `reference_date` for filings. It is not the delivery date.
_Avoid_: delivery date, filing date (`delivered_at` is the delivery date)

**Version**:
CVM's `VERSAO` of a row. A restated period comes in a later version; the row kept is the latest version of the period.
_Avoid_: revision, draft

**CNPJ**:
The legal id of a company or a fund in CVM's files. A ticker reaches a CNPJ through the company list or the curated fund list, never through a name or an ISIN.
_Avoid_: tax id, ISIN

**Pending ticker**:
A ticker with no CNPJ in the company list or the fund list. The load names it as pending and guesses no CNPJ.
_Avoid_: unknown, missing (the ticker is known; its CNPJ is not)

**Primary source**:
The source a field is taken from first. CVM for what it carries. Another source only for a field CVM does not carry, and never after a CVM failure.
_Avoid_: default, main

**Background load**:
A load that outlives the threshold of `query_sql` (`INVESTMENT_MCP_BACKGROUND_AFTER_SECONDS`, 5 seconds by default). The query answers with the rows already stored and a warning; the load goes on, and Running the query again shows its progress and, once it has finished, the complete rows. Rule in `docs/adr/0022-long-loads-continue-in-the-background.md`.
_Avoid_: job, task

**Load id**:
The id of a load in this server process, given by `query_sql` while the load runs in the background. It is kept only while the process runs; a load that was running at a restart is closed as interrupted in `load_runs`.
