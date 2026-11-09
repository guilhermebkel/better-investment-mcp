# Test standards

How tests in this repository are written. `pnpm lint` enforces the rules marked **(lint)**, through Oxlint's Vitest rules (and `@vitest/eslint-plugin` for `no-conditional-in-test`) and the rules in `docs/code-standards.md`, which apply to tests too; the rest are checked in review. Every rule here serves one of two questions: would this test fail if the code broke, and is it testing the real code?

## Where tests live

- **Next to the code.** A test lives beside the file it tests and shares its name (e.g. `EnvUtil.ts` → `EnvUtil.test.ts`; `check-changed.mjs` → `check-changed.test.mjs`). There is no `test/` folder. Every test runs in Node.
- **The outer describe names what is tested (lint).** Every test in `src/` sits under a top-level `describe("ClassName.method()")`: the class the file tests and the public method the tests go through. Situations go in describes inside it, worded as a context (`describe("when the variable is set")`). Lint (`local/describe-target`) checks that the class is the file's and that the method exists and is public, so renaming a method without its tests fails. A private method is tested through the public one that calls it.
- **Through the highest seam.** Test behavior through operations, surfaces and the server (a real MCP client over `InMemoryTransport`, once the server exists). Test a lower module directly only for logic with many cases (the SQL guard, redaction, parsing).
- **Fixtures in the real format.** Fixtures for a vendor (Yahoo, CVM, StatusInvest, FNET, BCB) are complete responses in the real format, kept in `src/Testing/fixtures/`, and a test never calls the network. Test doubles (a fake provider, a local test server) live in `src/Testing/`, which production code never imports. Prefer a recorded response over one written by hand, and say in the fixture's name which it is (`recorded…`).
- **Every new behavior brings its test.** Each new operation, output path or rule gets a test, with a fake secret where output is involved.

## Which level

Many fast low-level tests, few slow ones. Pick the lowest level that can fail for the behavior you are adding. The level is your choice as the agent that does the work, not the issue's: an issue says what to prove, never which kind of test.

- **Unit and service tests** for utils, schemas, services and operations (with a double for the provider).
- **Server tests** for what a client sees: a real MCP client talks to the built server object in memory.
- **Package smoke** (`pnpm smoke`) for the built bundle: it starts the program through `node` and `npx` and checks that it starts, keeps `stdout` clean and exits as expected. It also runs the MCP `initialize` and `tools/list` exchange over stdio; the packaging issue adds `docker run -i`.
- **Integration** (`pnpm test:integration`, files `integration/*.integration.test.ts`) for what a double cannot prove: the real DuckDB file and its extensions (`integration/fulltext-search.integration.test.ts` installs the full-text extension from the network), or a vendor format that changed. `pnpm test` leaves these out. A test that reaches a real vendor is never part of `pnpm test` or of CI.

A bug found at a high level (smoke, integration, a user report) is first reproduced in a lower-level test, then fixed.

## What a test checks

- **Name the break.** Before writing the body, name the change to the code that should make the test fail. If you can't name one, the test checks nothing. A test that fails only when a constant or a message changes is a change detector: test the behavior that depends on it instead.
- **Expected values come from outside the code.** Write them as literals worked out by hand from the fixture, never computed with the code under test or its constants. Arithmetic that shows the derivation is fine.
- **Exact assertions (lint).** `toStrictEqual`, not `toEqual`. No `toBeDefined`, `toBeTruthy` or `toBeFalsy`. `toThrow` names the message; calls are checked with their arguments.
- **No vacuous passes.** An assertion that something never appears passes on empty output too: first assert there was something to check.
- **One behavior per test, named by the behavior,** in the domain's words (`GLOSSARY.md`): "refuses a query without a ticker filter", "keeps the default when the variable is missing".

## Test code stays simple

- **No logic in the test body (lint).** No `if` or `try` deciding which assertion runs. Cases that differ only in data are rows of `it.each`.
- **Same rules as the code (lint).** Complexity, nesting, parameters, nested calls and duplication apply to tests. Exemptions: magic numbers, external key spelling, `!` and `process.env`.
- **Builders, with what matters spelled out.** Build input with builders, and set every value the assertion depends on in the test itself.
- **Wait for the condition, never for time (lint).** `local/no-fixed-wait` rejects `waitForTimeout` and `setTimeout` in tests. Use `expect.poll`, `vi.waitFor` or a fake timer.
- **Clean structure (lint).** No skipped, focused, commented-out or duplicated tests; hooks at the top of their block.

## Real code, doubles only at the edges

- **Run the real thing.** Real services, real schemas. Don't mock this repository's own modules: if a test needs that, the seam is wrong.
- **Doubles only where the process meets the outside:** the vendor HTTP APIs (recorded fixtures), the clock, the file system when the test is not about the cache. Assert what the code did with them.
- **Time is an input.** Pass timestamps in; tests never depend on the clock.
- **Production code has no test-only methods.**

## Safety tests

Behavior that cannot fail has a deterministic test and no exception: every output path returns no secret (a fake one is planted and searched for); the tool list holds only read-only tools (a snapshot); a read-only query cannot read a file, reach the network or change the cache; an instruction planted in a document is returned as data and has no effect. A change to one of these rules changes its test in the same PR.

## Before finishing: the mutation check

Go through the code you changed and imagine the realistic mistakes: a wrong threshold, the wrong branch, a missing redaction, a filter the guard lets through, an empty result, an off-by-one, something counted twice. Some test should fail for each. When none would, add or fix the test before committing.
