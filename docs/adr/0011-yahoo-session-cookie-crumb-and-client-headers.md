# Yahoo: session cookie and crumb, and per-adapter headers

Date: 2026-11-08.

Issue #6 (S8, S9, AC8) asks the Yahoo adapter to use the cookie and crumb flow of the `yfinance` library, and to test client headers in a fixed order if Yahoo refuses the first calls. It asks the record of each header tried, which one worked, and the date.

## What was tested

- A live request to the chart endpoint (`query1.finance.yahoo.com/v8/finance/chart/PETR4.SA`) from the build environment, with the adapter's own client identity, on 2026-11-08, answered **HTTP 429** (a rate limit). Yahoo did not answer 401 or 403, so no header refusal was seen.
- Because the answer was a rate limit, no other header was tested live. Browser `User-Agent` values were not tried to get past the rate limit: that would be a client impersonation to pass a block, which this project does not do (`docs/adr/0010-statusinvest-terms-unread-owner-decision.md`).
- The cookie and crumb calls were not tested live either, for the same reason.

## Decision

- The adapter requests a cookie from `fc.yahoo.com`, then a crumb from `query1.finance.yahoo.com/v1/test/getcrumb` with that cookie. The crumb is sent as the `crumb` query parameter, with the cookie.
- The cookie and crumb are requested once per adapter instance and reused. A refusal (401 or 403) renews them once. A second refusal stops the load and writes no row (AC8).
- The headers are the client identity of `HttpAdapter` plus `Accept: application/json`, set in `YahooAdapter.HEADERS`. `HttpAdapter` now accepts headers per adapter (`HttpOptions.headers`); they are added after the identity and never replace it.
- `fc.yahoo.com` is in the adapter's host list, next to `query1.finance.yahoo.com`.

## Consequences

- The cookie and crumb flow is tested with fakes only (`YahooAdapter.test.ts`, AC8). It has not been run against Yahoo. The first live load, when the rate limit lifts, is the test that settles it; if it fails, this ADR is updated with the answer.
- Quotes and dividends are two adapter instances, so a load of both requests the cookie and crumb twice.
- Issue #6 stays open until a live load confirms AC1 and AC8.
