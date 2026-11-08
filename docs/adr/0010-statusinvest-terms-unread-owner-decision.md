# StatusInvest: the terms were not read, and the owner chose to build the adapter

Date: 2026-11-08.

Issue #8 asks the agent to read the StatusInvest terms of use and `robots.txt` before any adapter is written, and to stop if the terms forbid automated access or leave it unclear. The agent asked for both pages from the session's environment and got HTTP 403 for each. The API endpoints named in the issue also answered 403 to a plain request from the same environment.

## Decision

- The owner decided to build the adapter anyway (a message in the session, 2026-11-08). The terms stay unread: nothing in the repository says the use is allowed.
- The adapter identifies itself with its own User-Agent (`HttpAdapter.USER_AGENT`) and waits one second between calls (`StatusInvestAdapter.PAUSE_MS`), as issue #8 asks.
- The adapter does not copy the User-Agent of another client. The Gbkel flows the issue references send `PostmanRuntime` "to avoid blocks"; a block is an access control, and imitating another client to pass it is not built.
- A 403 or 429 from the site stops the load with a message that names the block and the status (issue #8, AC5). Nothing is retried in a loop.
- Fixtures are written from the field list of the issue, not recorded from the site. Their tests say so.

## Consequences

- Until the site allows this client, loads of `fundamentals` and `fii_monthly` fail with the block message. The data they would give is not served.
- Before the adapter serves real data, the owner reads the terms and writes the result here, or an access path the site allows is found (a contract, a key, or a written permission). Either one is a new ADR.
- The issue stays open, with the `needs-info` label to be set by the owner. This ADR does not close it.
