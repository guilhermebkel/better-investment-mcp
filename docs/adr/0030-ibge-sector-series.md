# IBGE sector series: the number of companies by CNAE class

Date: 2026-11-14.

Status: accepted by the owner on 2026-11-14; the number of companies is built, the producer price index is not (issue #41, phase 3).

Issue #41 proposes the sector asset `BR:sector:<CNAE code>` with two IBGE SIDRA tables: 6449 (number of companies by CNAE 2.0, yearly) and 6903 (producer price index by industrial activity, monthly). P2 of that issue requires the data terms of a source to be read on the source's page and quoted here before an adapter is written.

## The terms: accepted by the owner, not read by the server

The IBGE terms pages could not be read from this server on 2026-11-14: the terms of use and privacy page answered HTTP 403, `apisidra.ibge.gov.br` answered HTTP 403, and the API documentation answered HTTP 503 or a connection reset. The server does not bypass a block (P4), so no terms text is quoted here.

The owner accepted the use of these IBGE series on 2026-11-14. That acceptance is the decision this ADR records; it does not replace the text of the terms. The owner must read the IBGE terms on the IBGE site and paste the attribution text here, so that the sources guide can quote it. Until then the attribution is missing from the answers.

## Decision

- Asset `BR:sector:<code>`, where `<code>` is the CNAE 2.0 code as IBGE writes it, at section, division, group or class level (`10`, `29.10-7`).
- Metric `sector.companies` in `asset_metrics`: the number of companies in the category, unit `count`, one row per year, from table 6449, variable 2585, classification CNAE 2.0 (`c12762`). The adapter finds the category whose name starts with the code, in the latest year; a code that is not a category of the table fails the load and names the code and the table. A missing value is stored as null.
- Metric `sector.producer_price_index`: not built. The variable and the activity classification of table 6903 could not be identified from this server, because the IBGE metadata endpoint answers a connection reset. The index is added when those ids are read from the metadata and checked against the values route.

## Verified against the live values route on 2026-11-14

- Table 6449, variable 2585 `Número de empresas e outras organizações`, unit `Unidades`, year 2021: `29.10-7 Fabricação de automóveis, camionetas e utilitários` has 57 companies; `10 Fabricação de produtos alimentícios` has 58,077.
- The route answers HTTP 200 for the two categories in one request and HTTP 400 for a wrong classification id.
