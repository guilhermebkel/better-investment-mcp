# ANEEL: electricity companies (stopped at the ADR)

Date: 2026-11-15.

Status: stopped. No adapter is written. The source is `excluded` in `scripts/source-coverage.json` with this reason (issue #59, phase 2c).

## What was checked on 2026-11-15

- `https://dadosabertos.aneel.gov.br/` could not be reached: the connection was reset on three tries.
- `https://www.gov.br/aneel/pt-br/dados/dados-abertos` answered HTTP 404.
- No terms page could be read, so no terms are quoted and no dataset is recorded.

## Next step

When the portal answers and its terms can be read, the phase starts again from its ADR.
