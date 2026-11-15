# Anatel: mobile accesses per operator (stopped at the ADR)

Date: 2026-11-15.

Status: stopped. No adapter is written. The source is `excluded` in `scripts/source-coverage.json` with this reason (issue #59, phase 2b).

## What was checked on 2026-11-15

- `https://www.anatel.gov.br/dadosabertos/` answered HTTP 403 to this server. The server does not bypass a block (issue #59, rule of the source phases).
- `https://dadosabertos.anatel.gov.br/` could not be reached: the proxy tunnel failed (HTTP 502) on each of three tries.
- The terms page could not be read, so no terms are quoted. The phase stops here as the issue requires.

The mobile access file (3.27 GB, checked by `HEAD` on 2026-11-14) is not loaded, and its columns are not recorded here, because the file could not be read on 2026-11-15.

## Next step

When the terms page answers, the phase starts again from its ADR.
