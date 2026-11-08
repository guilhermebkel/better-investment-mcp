# The repository harness comes from better-caprover-mcp

The lint rules, the local ESLint rules, the quality tools, the standards docs, the agent docs, the check scripts and the CI jobs are adapted from `guilhermebkel/better-caprover-mcp`, which took them from the author's private repository `tocomevidencia`, which took them from harness-ledger (MIT). The goal is that every later issue is done by an agent that finds the same rules and the same checks, and that a mistake fails a tool, not a review.

## Considered options

- Starting without a harness: rejected. Rules written only as text get broken; each one that a tool can check is a lint rule, a type or a test.
- Copying the harness as it is: rejected. CapRover's SDK, the access modes, the risk tiers, the code surface, the sandbox and the HTTP transport do not exist here, so their rules, scripts and docs were removed. The operation rules (`operation-name`, `operation-port`) stay. The SDK drift check became a source drift check, and the operation docs check became a tool docs check.

## Consequences

- `pnpm check` is the single gate, locally and in CI.
- A limit is never raised and an ignore is never added to pass.
- A rule that needs code this project does not have yet (the operation port, the manifest, the SQL guard) is marked planned in the standards and gets its tool in the pull request that adds the code.
