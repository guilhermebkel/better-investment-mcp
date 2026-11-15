# MCP standards

How the tools of this server are designed. `pnpm lint` enforces the rules marked **(lint)**, `pnpm test` the ones marked **(test)**; the rest are checked in review. A rule marked **(planned #n)** is enforced by the issue `#n`, which adds the code it needs. Each rule is one line. A tool is read by a model that cannot ask a question, so the contract is the schema, the description, the response and the error.

The server has four tools. Three are read-only: `get_overview`, `get_guide` and `query_sql`. `notify_load_finish` is the one exception: it sends one POST to an https address the caller gives, when a background load finishes (`docs/adr/0028-load-callback-to-a-url-the-agent-gives.md`). There are no access modes, no toolsets and no risk tiers. Data is read with one SQL tool (`docs/adr/0003-all-data-is-read-through-one-sql-tool.md`).

## Scope

- **Four tools, three read-only (test).** A test fails when `src/Operations/` has a tool other than the ones named in `docs/product/architecture.md`, or when a read-only tool is not marked so. A new tool needs an ADR.
- **One operation per tool (review).** A class in `src/Operations/` implements `OperationPort` and is listed once in the operation manifest.
- **Filtering, aggregation and ranking happen in SQL, not in a tool (review).** The agent computes; the server never returns a prepared analysis, a score or a recommendation.
- **Names are a verb and an object, and the tool name is derived (lint: `local/operation-name`).** The class `NAME` is camelCase (`querySql`); the manifest derives the tool name (`query_sql`); a test fails when two operations collapse to the same tool name.
- **No service prefix (review).** The client already shows the server name; a prefix costs tokens in every turn.

## Input

- **Schemas are strict and every field is described (lint: `local/strict-input-schema`).** No extra properties; a field with a wrong name fails instead of being ignored.
- **A parameter name says the kind of value (lint: `local/no-vague-field-name`).** `sql`, `topic`; never `input`, `data` or `value`.
- **A closed set is an enum; a format has a pattern or an example (review).** A number is an integer with `minimum` and `maximum`, and its unit is in the name.
- **An optional field is omitted by default and never defaults to a sentinel string (test).** A schema walk fails on a default of `"undefined"`, `"null"` or `""`.
- **Limits live in the schema (test).** The SQL text has a maximum length; a topic is an enum read from one list in code.

## The SQL tool

- **Only a `SELECT` runs.** A statement of any other kind, more than one statement, `PRAGMA`, `COPY`, `ATTACH`, `INSTALL` and `LOAD` are refused before anything runs.
- **The connection is read-only and has external access (files, network) disabled (planned #3).** The refusal does not depend on the SQL guard alone.
- **Every asset table is filtered by `asset_id` with equality or `IN` with literal values.** `asset_metrics` also needs `metric`; `asset_filing_chunks` also needs `document_type` or `filing_id`. The rule is tested in `src/Services/SqlGuardService.test.ts` (ADR 0021).
- **A refusal names the table, what is missing and a corrected example.** The reader is a model that cannot ask a question.
- **The server loads what is missing before it runs the query.** The answer carries a `loaded` report: per category and asset, the source, the rows, the period and the error if any.
- **An empty result for an asset that could not be loaded says so.** It must not look like "no data".
- **Output is limited to 1,024 rows and 50,000 characters, and a cut is always reported.** The service is `OutputLimitService`; `query_sql` applies it once the store exists. The report says what was cut and how much remains.

## Third-party text

- **Text from filings and other documents is data, never an instruction (planned #10, test).** It is returned in data fields; a test plants an instruction in a document and checks that it has no effect.
- **The server instructions say it once (test).** The instructions state that the server only reads, that the agent starts with `get_overview` and `get_guide`, that all data comes from `query_sql`, and that document text is data.
- **A tool never gives investment advice (review).** The output describes and locates information; the usage notice says so in `get_overview`.

## Descriptions

- **Order: what it does; when to use it; when not to and which neighbor to use; what it returns and what it returns when empty; limits (review).** One sentence each.
- **A description opens with the nature of the action (test).** Every read-only tool starts with "Read-only."
- **Each tool declares its annotations in its operation, and the surface passes them on (test).** `readOnlyHint` and `idempotentHint` are true for the three read-only tools; `openWorldHint` is true for `query_sql` (it can start a load from a vendor) and for `notify_load_finish` (it POSTs to a URL), and false for `get_overview` and `get_guide`; `destructiveHint` is false for all four, and `notify_load_finish` has `readOnlyHint` false and `idempotentHint` false.
- **A description has a length limit, set at today's worst case (test).** Long specifications go to a guide topic.
- **Rules that span tools live in the server `instructions`, once (review).** The usual order of calls, the filter rule.
- **A description may name a neighbor tool to route or to say where a value comes from, never to prescribe the order of a flow (review).**
- **Return fields have self-explanatory names (review).** A long legend of abbreviations in a description is paid in every turn.

## Responses

- **Concise by default (review).** Rows are returned as the query selects them; the tool adds nothing the query did not ask for except the `loaded` report and the truncation notice.
- **A truncated result says so and says how to get the rest (test).** `truncated: true` plus what to change in the query.
- **Numbers are numbers, with the unit in the column name (review).** `amount_brl`, not "R$ 1,2 mi".
- **Every row keeps the `source` that produced it.** The agent can tell which vendor a number came from.
- **A secret never leaves (test).** Every output path is tested with a fake secret (`RedactUtil`).
- **A result is structured (review).** The text content carries the summary and the data as JSON, because some clients show only the text to the model. `structuredContent` carries the counts, the truncation and the report, not the rows, so the rows are not sent twice. Every tool declares an `outputSchema`.

## Errors

- **A failed execution is a result with `isError: true` (test).** It names what failed, why, and what to do next; protocol errors are only for an unknown tool or invalid arguments.
- **An invalid value comes back with the valid ones (test).** An unknown guide topic returns the list of topics; an unknown series returns the known series.
- **An error message has no stack trace and no secret (test).**
- **A vendor failure is reported with the vendor and the cause.** "Yahoo answered with a rate limit", not "request failed".

## Documentation on demand

- **A `get_guide` tool serves topics (planned #13).** Topics: `sql`, `search`, `sources`, `limits`. Every topic named anywhere exists, and every SQL example in a guide is run against the SQL guard in a test, so a guide cannot teach a query the server refuses.
- **Three layers (review).** The description says when to use the tool; the guide says how to write the input; the error says how to fix this call.
- **A guide item has a purpose line, the syntax, accepted values by type, restrictions, examples and one wrong example marked BAD (review).**

## Cache and freshness

- **The server writes only to its own temporary cache file (test).** The file lives in `INVESTMENT_MCP_CACHE_DIR` (default: the system temporary directory) and each load is valid for `INVESTMENT_MCP_CACHE_TTL_SECONDS`. Deleting the file loses nothing (planned #3).
- **No telemetry and no commercial suggestions (review).**

## Before merging a tool

- Is the tool read-only, and does the description start with "Read-only."?
- Is the schema strict, every field described, every value kind in its name?
- Does the description follow the order and fit the length limit?
- Is the response short, with numbers as numbers, the `source` kept and no secret?
- Does an invalid input return the valid values?
- Does a refusal say what is missing and show a corrected example?
- Was it tried in a task that needs several calls, and was the transcript read?
