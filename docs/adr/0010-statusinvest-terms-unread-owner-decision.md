# StatusInvest: the terms were not read, and the owner chose to build the adapter

Date: 2026-11-08.

Issue #8 asks the agent to read the StatusInvest terms of use and `robots.txt` before writing any adapter, and to stop if the terms forbid automated access or leave it unclear. The agent requested both pages from the session environment and got HTTP 403 for each. The API endpoints named in the issue also answered 403 to a plain request from the same environment.

## Decision

- The owner decided to build the adapter anyway (a message in the session, 2026-11-08). The terms stay unread, so nothing in the repository says the use is allowed.
- The adapter waits one second between calls (`PAUSE_MS` in `StatusInvestAdapter.ts`), as issue #8 asks.
- The adapter does not imitate another client to get past a block. A block is an access control, so a different client identity is not used to pass it.
- A 403 or 429 from the site stops the load with a message that names the block and the status (issue #8, AC5). _Superseded in part by ADR 0012: a 403 is retried twice before the load stops._
- Fixtures are written from the field list of the issue, not recorded from the site. Their tests say so.

## Open inconsistency

The shared HTTP adapter sends `User-Agent: PostmanRuntime/7.44.1` on every request (`HttpAdapter.USER_AGENT`, used by every vendor adapter). That is the identity of another client, which the decision above rules out. The owner decides whether the adapter sends its own identity instead, or whether this ADR is amended to allow the current value. Until then this ADR does not match the code.

## Consequences

- Until the site allows this client, loads of `fundamentals` and `fii_monthly` fail with the block message. The data they would give is not served.
- Before the adapter serves real data, the owner reads the terms and records the result here, or an access path the site allows is found (a contract, a key, or a written permission). Either one is a new ADR.
- The issue stays open, with the `needs-info` label to be set by the owner. This ADR does not close it.
