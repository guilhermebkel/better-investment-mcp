# Oxlint runs the rules, a minimal ESLint runs what Oxlint cannot

Oxlint runs almost every rule, including the repository's own rules written as an ESLint plugin in `scripts/eslint-local-rules.mjs`. A minimal ESLint config holds only what Oxlint cannot run or runs differently (naming conventions that need type information, `no-useless-assignment`, a few syntax restrictions). `pnpm lint` runs both in parallel.

## Considered options

- ESLint alone: rejected. It is much slower on the whole project, and the lint run is part of every commit.
- Oxlint alone: rejected. A few rules the harness relies on do not exist there.

## Consequences

- A rule has one home: the Oxlint config unless it cannot run there. The reason for each ESLint rule is in a `Why:` comment in `eslint.config.mjs`.
- The local rules have tests in `scripts/eslint-local-rules.test.mjs`, and the lint behavior of each rule has a case in `scripts/lint-rules.test.mjs`.
