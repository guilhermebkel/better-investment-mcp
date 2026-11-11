# Code standards

How code in this repository is written. `pnpm lint` enforces the rules marked **(lint)**; the rest are checked in review. When a rule and readability disagree, raise it in the PR instead of working around the rule.

**A rule that a tool can check is a tool, not a sentence.** When a rule here can be a lint rule, a type or a test, it becomes one (this repo's own rules live in `scripts/eslint-local-rules.mjs` and run in Oxlint as a JS plugin, `docs/adr/0007-oxlint-with-a-minimal-eslint.md`); text is for what no tool can check. A written rule the agent keeps breaking is the sign it should move.

## Architecture

- **Layers (lint).** Inside `src/`, folders form layers and a layer imports only the ones below it: `Errors` (error classes, import nothing) < `Protocols` (types) < `Schemas` (Zod schemas) < `Utils` < `Services` and `Adapters` < `Operations` (one class per tool) < `Surfaces` (the MCP surface, the operation manifest, the builders of the MCP server) < `Setup` (the entry points: start, stdio, `init`; they never import an adapter). Tests may import any layer: nothing imports them. `src/Testing/` (test doubles and fixtures) is outside the layers: only tests import it (lint). Import cycles fail `pnpm quality` (dpdm, `import type` ignored).
- **A vendor lives in one place (lint).** `@duckdb/node-api` is imported only in `src/Adapters/DuckDb/`, and `@modelcontextprotocol/sdk` only in `src/Setup/` and `src/Surfaces/`. Each data vendor (Yahoo, CVM, StatusInvest, FNET, BCB) lives in its own `src/Adapters/<Vendor>/` folder, and the only code that reaches the network. The rest of the code depends on the adapter's contract, never on the vendor's SDK.
- **Imports use `@/` and the real file name (lint).** `@/` points to `src/`. Every import is `@/Utils/TimeUtil.ts`: never `../` or `./`. One style means searching for a file's `@/` path finds every importer.
- **Names say the folder (lint: `local/file-suffix`).** Files are `PascalCase` and end with the folder's name, singular, before `.ts` and before `.test`: `SqlGuardService`, `YahooQuoteAdapter`, `QuerySqlOperation`, `EnvProtocol`, `TimeUtil`, `StartupRunner`. Subfolders (`src/Adapters/Yahoo/`) take the suffix of the top folder. The map of folder to suffix is `FOLDER_TO_SUFFIX` in `scripts/eslint-local-rules.mjs`: `Errors` `Error`, `Protocols` `Protocol`, `Schemas` `Schema`, `Utils` `Util`, `Services` `Service`, `Adapters` `Adapter`, `Operations` `Operation`, `Surfaces` `Surface`, `Setup` `Runner`. A new folder under `src/` needs its entry in the map before its first file. Exempt, and only these: `index.ts`, non-code files, `src/main.ts`, `*.d.ts`, and the folders not in the map (`src/Testing/`, whose files are named after what they double, and `src/types/`).
- **Classes, not loose functions.** Utils are classes with static methods only. Services are classes whose dependencies come in through the constructor. Runtime constants belong to the class that owns them as `static readonly` members. The entry file `src/main.ts` only calls a class.
- **One class per file, named after it (lint).** `max-classes-per-file`, `local/class-matches-file`.
- **A `<Name>Protocol.ts` file holds types only (lint: `local/protocol-types-only`).** `type`, `enum` or `interface`, no value: no constant, function or class. Use `type` by default; `interface` is only for the contract of a class, named `<Name>Port` (`local/interface-for-contracts`). Product code under `src/` does not declare `type`, `interface` or `enum` outside `src/Protocols/*Protocol.ts` (`local/types-in-protocol-files`). Exceptions: `*.test.ts` (fixtures), `*Schema.ts` (types paired with `z.ZodType<…>` per `local/no-inferred-type`), and `*.d.ts` (ambient declarations). A schema, a builder of a schema and the constants of its sizes live in the `<Name>Schema.ts` file next to it. A type or schema used by one file gets a pair named after that file with the suffix removed (`EnvProtocol.ts` and `EnvSchema.ts` for `EnvUtil`); only what two or more files use goes in a wider domain pair (`AccessProtocol.ts`).
- **Errors live in `src/Errors/` (lint).** One class per file, named after what went wrong and ending in `Error` (e.g. `DailyLimitError`). Anything that extends `Error` outside that folder fails lint (`local/error-location`).

## Naming

- **English everywhere.** Identifiers, environment variables, operation names, parameters, comments, docs and messages are in English: the project is open source.

- **Casing (lint).** Variables, functions and parameters are `camelCase`. Types, interfaces and classes are `PascalCase`. Module-level and `static readonly` constants are `UPPER_CASE` (a `static readonly` string, number, boolean or array is checked like a module-level one). Environment variables keep their `UPPER_CASE` spelling. Discriminated-union kinds and the tool names a client sees are `snake_case`.
- **Operation names (lint).** An operation's class is `<Name>Operation` and its `static readonly NAME` is the same name in `camelCase`, without `Operation`: `QuerySqlOperation` is `querySql`. The operation manifest derives the `snake_case` tool name (`query_sql`) the client sees; a test fails when two operations collapse to the same one. `local/operation-name` checks every class in `src/Operations/`.
- **Every operation implements the same port (lint).** An operation class implements `OperationPort<Input>`: its `description`, its `inputSchema` and its `execute`. An operation takes what it needs in its constructor. `local/operation-port` checks it; an operation that leaves one member out does not compile. The port is `OperationPort` in `src/Protocols/OperationProtocol.ts` (`docs/product/adding-an-operation.md`)..
- **Operation verbs and objects.** An operation starts with its verb: `get`, `query`. Every operation reads; none writes (`docs/mcp-standards.md`). Name a new operation this way before you add it to a guide topic or an ADR.
- **Descriptive names (lint).** No single-letter identifiers, including loop indexes and callback parameters: `(article) => …`, not `(a) => …`. A name says what the value is in this domain (`GLOSSARY.md`), never `data`, `item`, `value` or `obj` when something more specific exists.
- **Function names (lint).** A function, method or arrow function starts with a verb in base form as a whole camelCase word: `getBlocks`, `buildCard`, `findLicense`, never `blocksOf` or `getter`. The allowed verbs are `ALLOWED_VERBS` in `scripts/eslint-local-rules.mjs` (`local/verb-function-name`); add a real verb there when none fits. Predicates (`is`, `has`, `can`, `should`), hooks (`use…`), components and classes (PascalCase), constructors, getters and `on<Event>` handlers are exempt.
- **Booleans (lint).** Start with `is`, `has`, `should`, `can`, `must`, `was` or `did`. Names are affirmative: `isOpenAccess`, never `isNotRestricted`.
- **Maps and records (lint).** Every `Record` or `Map` is named `keyToValue`: `doiToArticle`, `kindToSchema`, `LICENSE_TO_PERMISSION`. A `Record<string, unknown>` is a plain object and is exempt.
- **Units.** A number with a unit carries it in the name: `idleMs`, `maxTokens`, `costUsd`.
- **Points in time.** ISO strings end in `At` (`createdAt`). Epoch milliseconds end in `AtMs`, e.g. `startedAtMs`. A bare `Ms` suffix is always a duration.
- **English in code.** Identifiers, comments, docs and error messages are in English. Text the user reads is in the user's language and lives in the UI or the prompts, not in identifiers.

## Functions

- **A function is an arrow function (lint: `local/arrow-function`, `prefer-arrow-callback`).** `const readPage = async (url: string): Promise<Page> => { … }`, never `function readPage()` or `const readPage = function () {}`. A `const` is defined before it is used (`@typescript-eslint/no-use-before-define`), so a function sits above the code that calls it.
- **Only these functions stay `function`, each with its reason.** A new exception needs a line here, never an ignore comment on the file.
  - A generator (`function*`): an arrow cannot be a generator.
  - A function that reads its own `this` or `arguments`: an arrow reads the outer ones.
  - An overloaded function, its signatures and its implementation: the signatures are declarations only `function` can make.
  - A function with an assertion signature (`asserts value is T`): an arrow cannot declare one.

## TypeScript

- **No `any` (lint).** Data from outside the program (the environment, vendor responses, tool arguments, document text) is `unknown` and is parsed with a Zod schema before use.
- **No vague types for known shapes.** Declare the shape or a union of string literals instead of `object`, `Record<string, unknown>` or `string`.
- **Exhaustive unions (lint).** A `switch` over a union handles every member; prefer a `Record<Union, …>` map, which the compiler checks for completeness.
- **Reuse types.** Derive from an existing type (`Pick`, `Omit`, `Partial`, `&`, `z.infer`) instead of copying fields.
- **One member per line (lint, partly).**
- **`strict` and `noUncheckedIndexedAccess`** are on.

## Logic

- **Braces always (lint).**
- **No magic numbers (lint).** Every number other than `0`, `1` and `-1` is a named constant with its unit. Tests are exempt.
- **Known values are typed, not `string` (lint).** When every key of a `Record` or every item of an array or `Set` is written in the code, type it with a union (`Record<HtmlEntity, string>`, `ReadonlySet<ChatStatus>`), so a typo fails to compile (`local/known-keys`). A value that comes from outside is checked with a type guard (`Object.hasOwn(MAP, value)`) before it indexes the map. A single value is a constant and a comparison, not a one-item `Set`.
- **Maps over comparing with fixed values (lint).** When code decides what to do by comparing a value with fixed strings, the decision is a `Record<Key, Handler>`, so a new member of the union is a compile error until it has its handler (`local/literal-dispatch`). Allowed: a guard that leaves early, a comparison that only becomes a value, a `typeof` check, a check against `""`. A set of values that share an answer is a `Set`.

  ```ts
  // Before
  if (operation.kind === "add_observation") { return this.addObservation(analysis, operation); }
  if (operation.kind === "discard_hypothesis") { return this.discardHypothesis(analysis, operation); }

  // After
  return this.kindToHandler[operation.kind](analysis, operation);
  ```

- **Small functions (lint).** Cognitive complexity ≤ 15 (`sonarjs/cognitive-complexity`), nesting ≤ 3 (`max-depth`), parameters ≤ 5 (`max-params`; group the rest in an options object). Extract a named private method instead of raising a limit. Lint also rejects identical functions, duplicated branches, collapsible `if`s, more than three `&&`/`||`/ternaries in one expression, nested template literals, a `switch` inside a `switch` and assignments inside expressions.
- **Name a call before passing it on (lint).** A call passed as an argument stays simple: if it takes three or more arguments or receives another call, store its result in a named variable first.
- **Safe regular expressions (lint).** No super-linear backtracking (`sonarjs/super-linear-regex`), `regex-complexity` ≤ 20.
- **Explicit order and branches (lint).** `toSorted()` with a comparator, `toReversed()`; every `else if` chain ends in `else`; at most one `break`/`continue` per loop; a function returns one type.
- **No nested ternaries (lint).**
- **Name intermediate steps.** Complex conditions go into a named boolean.
- **One responsibility per function, and the name says it.** `readX` doesn't write; `findX` doesn't create.
- **No duplicated logic.** Search before adding a helper; reuse or extract to `src/Utils/`.
- **Unmapped values stay visible.** A value with no mapping (an unknown field of a vendor response, an unknown filing category) is never dropped or guessed: it is returned as unmapped and the result built on it is marked partial, with the reason.
- **No `console` (lint).** Logging goes through `LogUtil`, which writes to stderr and never logs a secret. Levels, format and what a log may hold are in `docs/log-standards.md`.
- **Floating promises (lint).** Every promise is awaited or returned.

## When lint rules collide

- **`as Type` against `!`.** Restructure instead: narrow with a guard that returns early (tests may use `!`).
- **Copies use the ES2023 methods** (`toSorted()`, `toReversed()`), not `[...array].sort()`.
- **A function is a `const` arrow, defined above its first use.** A `function` declaration is hoisted and hides a call made before it, so lint rejects it (see "Functions").
- **Visitor keys in local rules are quoted** (`"IfStatement"(node)`).

## Patterns that cost the most rework

These came up repeatedly while the lint rules were being met. Writing them this way first saves a lint round.

- **A fixed mapping is a `Record`, not a chain of `if`s.** `CATEGORY_TO_PROVIDER[category]`, not three comparisons on `category`.
- **A repeated literal is a constant.** The third copy of a string fails lint; name it where the first one is used.
- **A call with three arguments or a nested call gets a named variable first.** Name the inner result, then pass it.
- **A `describe` names its target as `Class.method()`.** One `describe` per method; do not merge methods into one block.
- **Comments inside functions start with `Why:`** and give a reason, never a description of the code. Lines stay under 120 characters.
- **Schemas live in `<Name>Schema.ts` files in `src/Schemas/` (lint: `local/schema-file`).** A file with another name imports a schema; it never calls `z.object`, `z.enum` or any other Zod builder. A Schema file may export a function that builds a schema from runtime values (skill names, a limit) and constants for the sizes the schema uses. Tests may build a schema for their own fixture.
- **Declare the type, then check the schema against it (lint: `local/no-inferred-type`).** `export type Foo = { … }` and `export const FooSchema: z.ZodType<Foo> = z.object({ … })`, so a schema that drifts from its type is a compile error. No `z.infer`, `z.input` or `z.output`, no `typeof SOME_CONSTANT` or `keyof typeof SOME_CONSTANT` in a type, and no exported `as const` array or object (a `static` member that is not `private` counts as exported, and `as const satisfies T` is the same shortcut) whose only job is to make a type; in product code a module-level constant or `static` member that is a map of literals (`{ a: 1, b: 2 }`, `new Map([...])`) or a bare string named `…_TYPE`, `_KIND`, `_STATE`, `_STATUS`, `_ROLE`, `_MODE` or `_PHASE` carries a declared type too: write the union out and annotate the constant with it. `typeof import("…")` and `typeof fetch` stay allowed.
- **A string that stands for one of several known values is a union, never `string` (lint: `local/no-bare-string-field`, `local/known-keys`).** A property named `type`, `kind`, `state`, `status`, `role`, `mode` or `phase` is typed with a declared union (e.g. `LogLevel`), and so is a `Map`, a `Record` or a parameter whose keys are a known set. A key that is free text (a company name, a ticker typed by the agent, a filing subject) stays `string`. A value that arrives from outside and that the code does not know is parsed to `"unknown"` in its schema and ignored, never thrown at.
- **A constant that stands for one value of a type carries that type.** `const DEFAULT_LOG_LEVEL: LogLevel = "info"`, never a bare `const X = "info"` that widens to `string`.
- **Normalize at the schema.** Values with one valid form (a domain, lowercase) are normalized in the Zod schema, so every path stores the same form.

## Boundaries and security

- **Environment variables (lint).** `process.env` is read only in `EnvUtil`, validated with Zod at startup. `process.stdout` is never used in `src/`: it belongs to the MCP protocol.
- **An operation validates its input in its schema only.** The schema is the one door: its types, limits and field descriptions say what a valid input is, and it is strict (`docs/mcp-standards.md`). No word list or regex over free text next to it. Rules that run during the call, once the input is known to be well-formed, stay in the service: the SQL guard, the output limits.
- **Validate at the edge.** Input is parsed where it enters: the environment, operation inputs (Zod `inputSchema`) and vendor responses. Code past the edge trusts its types.
- **Rules that cannot fail live in code.** Read-only access, the SQL guard, output limits and secret masking are enforced in services, adapters and operations, never only in a description or a prompt (`docs/adr/0004-no-tool-writes-to-the-outside-world.md`, `docs/adr/0006-the-query-must-filter-by-market-ticker-and-asset-type.md`).
- **Redact on the way out.** Every string that can reach a log or the model passes through `RedactUtil`. Any new output path gets a test with a fake secret. An API key and the value of an environment variable are never returned or logged.

## Before committing

Commit once per task, not per file. Before the commit, `pnpm check:changed` must pass. A `pnpm quality` finding means delete the dead code or extract the shared part, not add an ignore. While iterating, run only the relevant file (`pnpm exec vitest run <file>`).

## Dependencies

- **Licenses.** A package the bundle or the runtime installs has one of these licenses: MIT, ISC, Apache-2.0, BSD-2-Clause, BSD-3-Clause, 0BSD or BlueOak-1.0.0 (the list in `scripts/license-rules.mjs`). `pnpm check:licenses` fails on any other.
- **pnpm only.** Commit `pnpm-lock.yaml`; never `package-lock.json`.
- **The lockfile changes only with `package.json`.**
- **A new runtime dependency needs a reason** in the PR description.

## Backward compatibility

Code that exists only so old stored data keeps working (an older cache file schema) carries a `// @legacy: <what and why>` comment next to it, so it can be found with a search and removed when the old data is gone. Anything else (internal functions, operation inputs, docs) changes without a compatibility path.

## Tests

How tests are written is in `docs/test-standards.md`. The rules above apply to tests too, with the exemptions listed there.

## Formatting and comments

- **Formatting (lint).** `@stylistic` (an Oxlint JS plugin): 2-space indent, double quotes, semicolons, trailing commas in multi-line literals, lines up to 120 characters. `pnpm lint:fix` applies it.
- **No alignment (lint).** Never add spaces to align values into columns.
- **No comments by default (lint).** A comment stays only when the code guards a rule it doesn't show and someone could change it without knowing. It starts with `Why:` and names the rule (`// Why: CVM files use a comma as the decimal separator.`). Lint (`local/comment-marker`) rejects any other comment except tool directives.
- **A comment sits on the line it explains (lint).** Right above the statement where the rule happens, never above a whole function, class or type, never as a file header, never in a `<Name>Protocol.ts` file (`local/comment-placement`).
- **Delete what the code already says; keep the reason true (review).**
