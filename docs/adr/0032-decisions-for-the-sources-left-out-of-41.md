# Decisions for the sources left out of #41

Date: 2026-11-15.

Status: accepted by the owner on 2026-11-15. Phase 0 of issue #59 builds the guide lines and this record; the source phases (complaints, regulators, GDELT, CGU) follow in their own pull requests, each with its own ADR.

Issue #59 lists six items that #41 left out. The owner answered all six on 2026-11-15.

## Decisions

| # | Item | Decision | Reason given by the owner |
| --- | --- | --- | --- |
| D1 | Analyst consensus | No source. The sources guide says it is not available. | No free official source publishes it; Yahoo's terms allow personal use only. |
| D2 | Stock to CNAE | No stock-to-CNAE link in the server. The sources guide explains the `BR:sector:<code>` series, and the agent chooses the CNAE. | The Receita Federal CNPJ files add up to about 5.4 GB a month with no index by CNPJ, and their CC BY licence was found only in secondary sources. A curated list was rejected. |
| D3 | Consumidor.gov.br complaints | Monthly aggregates per trade name, found by a free-text term. No curated ticker list and no link to a ticker. | Noise and no match are accepted; the agent refines the term. |
| D4 | Sector regulators | BCB IF.data, Anatel, ANEEL, ANS, SUSEP, ANP and ANAC, one phase each, BCB and Anatel first. A regulator whose terms forbid automated use stops at its ADR. | Each source is a separate phase. |
| D5 | Margins against international peers | Dropped. The sources guide says it is not available. | The server has no foreign company data. |
| D6 | Later sources | Only GDELT DOC 2.0 and CGU CEIS/CNEP are built. Comex Stat, OECD, IMF and World Bank are dropped. | Scope of the issue. |

## Dropped sources

- Receita Federal CNPJ files (`Estabelecimentos0.zip` to `Estabelecimentos9.zip`).
- yfinance analyst consensus.
- Damodaran industry margins.
- SEC EDGAR for peer margins.
- Comex Stat, OECD, IMF and World Bank.

## Shared rules of issue #59

- Licence gate: a source's terms are read on its own page and quoted in its ADR before its adapter is written. When the terms forbid automated use, or the page cannot be read, the phase stops at the ADR. The server never bypasses a block (HTTP 403, a captcha, a login).
- Free-text term rule (complaints and GDELT): `_` in the asset code stands for a space; the term is matched after normalization (`CompanyNameUtil.normalize`, non-alphanumeric characters turned into spaces). There is no fuzzy match, synonym list or ticker list.
- CNPJ-root link rule (regulators and CGU): a row is linked to a stock only when its CNPJ has the same 8-digit root as the stock's `asset.legal_id`. No match by name and no curated list of subsidiaries.
