# CGU: CEIS and CNEP sanctions (stopped at the ADR)

Date: 2026-11-15.

Status: stopped. No adapter is written. The source is `excluded` in `scripts/source-coverage.json` with this reason (issue #59, phase 4).

## What was checked on 2026-11-15

- The terms page `https://portaldatransparencia.gov.br/termos-de-uso` answered HTTP 405 with a page that asks the visitor to prove they are not a robot ("you need to verify that you're not a robot by solving a CAPTCHA puzzle"). No terms text could be read.
- The server never bypasses a captcha (issue #59, rule of the source phases). The phase stops here, as the issue requires when no page with the terms can be read.
- The download pages `https://portaldatransparencia.gov.br/download-de-dados/ceis` and `.../cnep` answer HTTP 200. Their files were not downloaded, because the terms that govern them were not read.

## Next step

When the terms page can be read without a captcha, the phase starts again from its ADR: the terms are quoted here, the download URL and the columns of a real file are recorded, and the adapter is written. A route that needs a key is not used.
