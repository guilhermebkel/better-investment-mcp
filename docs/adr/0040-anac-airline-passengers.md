# ANAC: passengers per airline (stopped at the ADR)

Date: 2026-11-15.

Status: stopped. No adapter is written. The source is `excluded` in `scripts/source-coverage.json` with this reason (issue #59, phase 2g).

## What was checked on 2026-11-15

- `https://dados.anac.gov.br/` could not be reached: the proxy tunnel failed (HTTP 502). `https://dados.anac.gov.br/dados/` could not be reached either.
- `https://sas.anac.gov.br/` answers HTTP 200 with a default web server page, not a dataset.
- `https://www.gov.br/anac/pt-br/assuntos/dados-e-estatisticas` answers HTTP 200 and links the statistics, but holds no link to the terms of the data.
- No terms page could be read and no dataset with its columns could be read, so no URL or column is recorded.

## Next step

When the open data host answers and its terms can be read, the phase starts again from its ADR.
