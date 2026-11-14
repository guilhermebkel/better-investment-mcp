# B3 index membership: the weight of a stock in the four B3 indexes

Date: 2026-11-14.

Status: accepted by the owner on 2026-11-14; built for ISE B3, ICO2 B3 and IDIVERSA B3. IGPTW B3 is blocked on this server, so a load of index membership fails until it is readable (issue #41, phase 4).

Issue #41 proposes the index membership of a stock from the B3 index portfolio route. P2 of that issue requires B3's terms for this route to be read on B3's page and quoted here before an adapter is written.

## The terms: accepted by the owner, not read by the server

B3's terms of use page answered HTTP 500 (an error page) and the listing host answered HTTP 403 on 2026-11-14. The server does not bypass a block (P4), so no terms text is quoted here. The owner accepted the use of the portfolio route on 2026-11-14. The owner must read B3's terms for this route and paste the relevant sentences here.

## What the route returns

- `GET https://sistemaswebb3-listados.b3.com.br/indexProxy/indexCall/GetPortfolioDay/<base64 of {"index":"<INDEX>","language":"pt-br"}>` returns the whole current portfolio: a header with the portfolio date (`dd/mm/yy`), and one result per asset with `cod` and `part` (the weight, with a decimal comma).
- Only the current portfolio is served. A past date has no row.
- Checked on 2026-11-14: ISEE returns 68 assets, ICO2 61, IDVR 88. GPTW (IGPTW B3) answers HTTP 403 for this client.

## Decision

- Metrics `index.isee`, `index.ico2`, `index.idvr` and `index.gptw` in `asset_metrics`: the weight of the stock in the index, unit `percent`, one row per index, dated with the portfolio date of the header (`reference_time_start` and `reference_time_end`). A stock in no index writes no row.
- A load reads the four indexes before it writes anything. An index that cannot be read fails the load, names the index and the reason, and writes nothing. A membership is never reported from part of the indexes (AC11, P4).
- The load does not record the four indexes as read in `load_runs` (AC10 of the issue): the rows are the record, and an empty answer for a stock in no index is not told apart from a load that did not read the index.
- The owner decides what to do about IGPTW: a different route, or a load that reports the three indexes it can read. Until then `index_membership` fails for every stock.
