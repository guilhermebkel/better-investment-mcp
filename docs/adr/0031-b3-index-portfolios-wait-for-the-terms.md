# B3 index portfolios wait for the owner: the terms could not be read

Date: 2026-11-14.

Status: accepted; the adapter is not built. The owner decides (issue #41, phase 4).

Issue #41 proposes the index membership of a stock (ISE B3, ICO2 B3, IGPTW B3, IDIVERSA B3), read from the B3 index portfolio route. P2 of that issue requires B3's terms for this route to be read on B3's page and quoted in an ADR before an adapter is written.

## What was checked on 2026-11-14

- The route answers: `GetPortfolioDay` with the base64 JSON `{"index":"ISEE","language":"pt-br"}` returns the current portfolio of ISE B3 (68 assets, the header dated with the portfolio date). Only the current portfolio is served, so a past date has no row.
- B3's terms of use page (`www.b3.com.br/pt_br/termos-de-uso/`) could not be read: HTTP 403. The server does not bypass a block (P4), so the terms are read as unavailable.

## Decision

- No `index_membership` category, no `b3_index` metrics and no B3 index adapter are added in this change.
- The owner reads B3's terms for this route. If they allow automated reading of the portfolio route, the adapter is built as the issue specifies, and this ADR records the terms it quotes. If they forbid it, the route is not used.
