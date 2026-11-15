# SUSEP: premiums per insurer (stopped at the ADR)

Date: 2026-11-15.

Status: stopped. No adapter is written. The source is `excluded` in `scripts/source-coverage.json` with this reason (issue #59, phase 2e).

## What was checked on 2026-11-15

- `https://dados.susep.gov.br/` answered HTTP 404.
- `https://www.gov.br/susep/pt-br/dados-abertos` answered HTTP 404.
- No terms page could be read, so no terms are quoted and no dataset is recorded.

## Next step

When a SUSEP open data page answers and its terms can be read, the phase starts again from its ADR.
