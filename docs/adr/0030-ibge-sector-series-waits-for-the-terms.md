# IBGE sector series wait for the owner: the terms could not be read

Date: 2026-11-14.

Status: accepted; the adapter is not built. The owner decides (issue #41, phase 3).

Issue #41 proposes the sector asset `BR:sector:<CNAE code>` with two IBGE SIDRA tables: 6449 (number of companies by CNAE, yearly) and 6903 (producer price index by industrial activity, monthly). P2 of that issue requires the data licence or the terms of each source to be read on the source's own page, and quoted here, before an adapter is written. A source whose terms cannot be found, or that forbids automated use, stops at this decision and goes back to the owner.

## What was checked on 2026-11-14

- The SIDRA values route answers for table 6449 (`apisidra.ibge.gov.br/values/t/6449/...`), so the data is reachable.
- The terms pages could not be read: `ibge.gov.br` terms of use and privacy (HTTP 403), `apisidra.ibge.gov.br` (HTTP 403), and the API documentation on `servicodados.ibge.gov.br` (connection reset). The server does not bypass a block (P4), so these pages are read as unavailable.
- The issue reports that IBGE states free use with attribution, but no named licence was found. That statement is not quoted here, because the page that holds it could not be read.

## Decision

- No sector asset type, no `sector` category, no IBGE adapter and no `asset_metrics` rows for sectors are added in this change.
- The owner reads the IBGE terms, and either accepts them (the attribution text then goes in this ADR and in the sources guide) or decides otherwise. Then the adapter can be built as the issue specifies.
