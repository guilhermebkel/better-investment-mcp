# StatusInvest: a 403 is retried twice, five seconds apart, before the block is reported

Date: 2026-11-08.

ADR 0010 says a 403 from the site stops the load at once. In the live flows that the owner runs in n8n (the Gbkel `Get Stock Data` and `Get Real Estate Data` workflows), each request has `retryOnFail` on with a 5-second wait, and a 403 can pass on a later try. The site answers 403 with a bot challenge, so a single 403 does not show that the site refuses this client for good.

## Decision

- A 403 from StatusInvest is retried at most two times, with a 5-second pause before each retry (`FORBIDDEN_RETRIES`, `FORBIDDEN_RETRY_PAUSE_MS`). If the third try is also a 403, the load stops with the block message (issue #8, AC5), and no row is written.
- A 429 is not retried here. The HTTP adapter already retries it once, after one second.
- The retry is a plain repeat of the same request with the same client identity. The adapter does not change headers, cookies or the client name to get past a challenge (ADR 0010).

## Consequences

- A load that the site blocks makes up to three requests per endpoint before it stops. A `fii_monthly` load with five endpoints can make up to fifteen requests, with pauses, before it reports the block.
- ADR 0010 stays the record of the terms decision. This ADR replaces only its bullet about retries.
