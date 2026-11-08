# Sustainability reports: CVM IPE evidence, IR site validation, and options

Date: 2026-11-08. Status: accepted. The owner approved Option (a) (partial CVM IPE coverage) on 2026-11-08 14:29 BRT for future implementation outside this PR. Follow-up work is tracked in issue #26 and issue #27.

Issue #15 asks where the latest sustainability reports of listed companies are published, whether a rule can find them reliably, and which path the server should take. This ADR records empirical data measurements from CVM IPE open data files and live web access tests against 10 benchmark companies.

## Decision Summary

- **Chosen Path**: Option (a) — CVM IPE sustainability categories in `CvmAdapter`. Implementation is scheduled for future dedicated issues; **no sustainability product code is included in this PR**.
- **Follow-up Issues**:
  - [Issue #26](https://github.com/guilhermebkel/better-investment-analysis-mcp/issues/26): CVM IPE: classify integrated and ISSB sustainability reports as sustainability filings.
  - [Issue #27](https://github.com/guilhermebkel/better-investment-analysis-mcp/issues/27): CVM RAD downloads: diagnose HTML answers and report unreadable filings honestly.

## Empirical Measurement of CVM Open Data

Inspection of official CVM IPE open data files (`ipe_cia_aberta_2025.csv` and `ipe_cia_aberta_2026.csv`, published under ODbL) confirms three distinct periodic sustainability categories:
- **"Relatório de Sustentabilidade"**: 190 filings in 2025; 153 filings in 2026.
- **"Relato Integrado"**: 49 filings in 2025; 55 filings in 2026.
- **"Relatório de Informações Financeiras Relacionadas à Sustentabilidade - Padrão ISSB"**: 6 filings in 2025; 10 filings in 2026.
- Filings under `"Política de Sustentabilidade"` (28 in 2025, 16 in 2026) were inspected and excluded; they represent corporate governance policies rather than periodic sustainability disclosures.

Querying by registered CVM code (19348) and CNPJ (60.872.504/0001-23) confirmed that Itaú Unibanco Holding S.A. files both "Relatório de Sustentabilidade" and "Relato Integrado" in CVM IPE (separate from Itaúsa CVM 7617).

## Verification of 10 Benchmark Companies

Each company was investigated across CVM IPE datasets (2025 and 2026) and its corporate IR portal:

| Company | CVM Code & CNPJ | CVM Category Found | Reference & Delivery Date | CVM Direct Download Status | IR Portal URL | IR HTTP Status & Terms Note |
| --- | --- | --- | --- | --- | --- | --- |
| Petrobras | CVM 9512 / 33.000.167/0001-01 | Relatório de Sustentabilidade | Ref: 2025-12-31, Del: 2026-06-22 (Prot: 1537066) | HTTP 200, 17,546,767 B, valid PDF (237 text segments, 0 blank pages) | `https://sustentabilidade.petrobras.com.br/` | HTTP 403 on automated GET. `robots.txt` specifies `crawl-delay: 10`. |
| Vale | CVM 4170 / 33.592.510/0001-54 | Relato Integrado | Ref: 2025-12-31, Del: 2026-04-15 (Prot: 1505012) | HTTP 200, 4,195 B (ASPX HTML page, no PDF) | `https://vale.com/pt/esg` | HTTP 200. Terms page returned 404. |
| Itaú Unibanco | CVM 19348 / 60.872.504/0001-23 | Relatório de Sustentabilidade | Ref: 2025-12-31, Del: 2026-04-30 (Prot: 1514294) | HTTP 200, 4,195 B (ASPX HTML page, no PDF) | `https://www.itau.com.br/relacoes-com-investidores/esg/` | HTTP 200. `itau.com.br/termos-de-uso` explicitly prohibits automated systems for mass access. |
| WEG | CVM 5410 / 84.429.695/0001-11 | Relato Integrado | Ref: 2025-12-31, Del: 2026-04-27 (Prot: 1508882) | HTTP 200, 4,195 B (ASPX HTML page, no PDF) | `https://ri.weg.net/sustentabilidade/relatorios-de-sustentabilidade/` | HTTP 404 on report path; root returned 200. |
| Ambev | CVM 23264 / 07.526.557/0001-00 | None in CVM IPE (2025/2026) | - | Absent in sustainability categories in 2025 and 2026 CSVs | `https://ri.ambev.com.br/informacoes-aos-acionistas/relatorios-anuais-e-de-sustentabilidade/` | HTTP 404 on report path; root returned 200. Terms page returned 404. |
| Lojas Renner | CVM 19895 / 92.754.738/0001-62 | Relatório de Sustentabilidade | Ref: 2025-12-31, Del: 2026-04-29 (Prot: 1511150) | HTTP 200, 4,194 B (ASPX HTML page, no PDF) | `https://lojasrennersa.com.br/sustentabilidade/` | HTTP 200. Terms page returned 404. |
| Localiza | CVM 19682 / 16.670.085/0001-55 | Relatório de Sustentabilidade | Ref: 2025-12-31, Del: 2026-09-01 (Prot: 1563384) | HTTP 200, 10,626,842 B, valid PDF (194 text segments, 4 blank pages) | `https://ri.localiza.com/sustentabilidade/` | HTTP 200. MZ terms page returned 200. |
| Suzano | CVM 20249 / 16.404.287/0001-55 | None in CVM IPE (2025/2026) | - | Absent in sustainability categories in 2025 and 2026 CSVs | `https://centraldesustentabilidade.suzano.com.br/` | HTTP 200. Terms page returned 404. |
| Axia Energia (Eletrobras) | CVM 2437 / 00.001.180/0001-26 | Relatório de Sustentabilidade | Ref: 2025-12-31, Del: 2026-05-12 (Prot: 1521005) | HTTP 200, 4,194 B (ASPX HTML page, no PDF) | `https://eletrobras.com/pt/Paginas/Sustentabilidade.aspx` | HTTP 200. `eletrobras.com/robots.txt` specifies `User-agent: * Disallow: /`. Terms page returned 404. |
| Totvs | CVM 19992 / 53.113.791/0001-22 | Relato Integrado | Ref: 2025-12-31, Del: 2026-04-30 (Prot: 1514188) | HTTP 200, 4,195 B (ASPX HTML page, no PDF) | `https://ri.totvs.com/sustentabilidade-esg/` | HTTP 404 on report path; root returned 200. Terms page returned 404. |

## Key Findings

1. **Metadata Coverage**: In this 10-company sample, 8 companies have filings under `"Relatório de Sustentabilidade"`, `"Relato Integrado"`, or `"ISSB"`. 2 companies (Ambev and Suzano) have zero filings under these three specific categories in the 2025 and 2026 CVM IPE datasets. This reflects absence in these metadata categories for these two years, not an absence from CVM entirely or from other disclosure channels.
2. **CVM Direct Download Limitation**: Direct downloading from the CVM IPE URL (`frmDownloadDocumento.aspx`) returned the raw PDF stream for Petrobras (17.5 MB) and Localiza (10.6 MB). Both files were verified locally to be complete, extractable PDFs. For the other 6 companies with filings, the endpoint returned HTTP 200 with an empty ASP.NET HTML page (~4,195 bytes), which `CvmDocumentAdapter` rejects (`CVM answered with a page, not a PDF document; no document was stored`). The technical cause of these HTML responses remains unisolated.
3. **CVM System Migration (ENET to ENETWeb)**:
   - On 2026-05-18, CVM announced an infrastructure change for the Empresas.NET system ([CVM News](https://www.gov.br/cvm/pt-br/assuntos/noticias/2026/area-tecnica-da-cvm-informa-mudanca-no-endereco-para-acesso-ao-sistema-empresas.net) and [Ofício-Circular CVM/SEP 03/26](https://conteudo.cvm.gov.br/legislacao/oficios-circulares/sep/oc-sep-0326.html)).
   - The legacy external query endpoint `https://www.rad.cvm.gov.br/enet/frmconsultaexternacvm.aspx` notes discontinuation on 2026-07-06 in favor of `https://www.rad.cvm.gov.br/ENETWeb/frmConsultaExternaCVM.aspx`.
   - Technical testing of the newer path `/ENETWeb/frmDownloadDocumento.aspx` on Vale protocol 1505012 produced a truncated binary stream (~22 MB without an EOF marker), which exceeded the server's 20 MiB safety limit before a connection reset (curl code 56).
   - In manual UI inspection of the new ENETWeb interface, the target Vale filing appears with status `Ativo` version 1 (not inactive or superseded), though the direct browser download URL was not captured. Diagnosing these download behaviors is deferred to issue #27.
4. **IR Site Access & Terms Observations**:
   - Automated requests to `sustentabilidade.petrobras.com.br` returned `HTTP 403 Forbidden`.
   - `itau.com.br/termos-de-uso` explicitly prohibits automated systems or applications for mass querying.
   - `eletrobras.com/robots.txt` specifies `User-agent: * Disallow: /`.
   - Several direct IR report paths returned 404, while domain roots returned 200. A root 200 does not confirm availability of a specific report.
   - HTTP 404 or 403 status codes and `robots.txt` directives are technical observations and do not establish affirmative legal permission or general prohibitions.

## Evaluated Options

- **(a) CVM IPE sustainability categories in `CvmAdapter` (CHOSEN)**:
  - Maps CVM IPE categories `"Relatório de Sustentabilidade"`, `"Relato Integrado"`, and `"Relatório de Informações Financeiras Relacionadas à Sustentabilidade - Padrão ISSB"` to `filing_type = 'sustainability'`.
  - Open data under ODbL.
  - Known limitations: Partial coverage (8/10 in sample); direct PDF download failure on certain RAD ASPX links; depends on ticker-to-CNPJ resolution.
- **(b) Web scraping company IR pages (NOT CHOSEN)**:
  - Rejected due to high fragility, site access blocks (403), explicit contractual prohibitions (Itaú), and high maintenance.
- **(c) User-provided document URL (NOT CHOSEN)**:
  - Evaluated as an alternative escape hatch, but not selected by the owner.
- **(d) Not supported for now (NOT CHOSEN)**:
  - Evaluated as a potential deferral, but owner authorized implementing official CVM coverage via follow-up issues.

## Consequences

- Option (a) is accepted for future implementation via issue #26 and issue #27.
- No sustainability code or tests are introduced in this PR.
- Issue #15 research is concluded and will be closed by the single PR closing #12 and #15 upon merge.
