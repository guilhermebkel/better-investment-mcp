# Sustainability reports: CVM IPE evidence, IR site validation, and options

Date: 2026-11-08. Status: proposed. The owner chooses the path; no product code is built before approval.

Issue #15 asks where the latest sustainability reports of listed companies are published, whether a rule can find them reliably, and which path the server should take. This ADR updates previous lead research with actual data measurements from CVM IPE open data and live web access tests against 10 benchmark companies.

## Correction History

The initial draft of this ADR relied on search engine snippets and stated that CVM IPE had no category named "Relatório de Sustentabilidade". That claim was incorrect. Direct measurement of CVM open data files (`ipe_cia_aberta_2025.csv` and `ipe_cia_aberta_2026.csv`, updated daily under ODbL) shows three distinct categories:
- **"Relatório de Sustentabilidade"**: 190 filings in 2025; 153 filings in 2026.
- **"Relato Integrado"**: 49 filings in 2025; 55 filings in 2026.
- **"Relatório de Informações Financeiras Relacionadas à Sustentabilidade - Padrão ISSB"**: 6 filings in 2025; 10 filings in 2026.
- Note: Filings categorized under `"Política de Sustentabilidade"` (28 in 2025, 16 in 2026) were inspected and excluded; they represent corporate governance policies, not periodic sustainability reports.

A prior search query conflated Itaú Unibanco with Itaúsa (CVM 7617). Querying by exact registered CVM code (19348) and CNPJ (60.872.504/0001-23) confirmed that Itaú Unibanco Holding S.A. files both a "Relatório de Sustentabilidade" and a "Relato Integrado" in CVM IPE.

## Verification of the 10 Benchmark Companies

Each company was investigated by its registered CVM code and CNPJ across CVM IPE files (2025 and 2026) and its corporate IR portal:

| Company | CVM Code & CNPJ | CVM Category Found | Reference & Delivery Date | CVM Direct Download Status | IR Portal URL | IR HTTP Status & Terms Note |
| --- | --- | --- | --- | --- | --- | --- |
| Petrobras | CVM 9512 / 33.000.167/0001-01 | Relatório de Sustentabilidade | Ref: 2024-12-31, Del: 2025-06-16 (Prot: 1390774) | HTTP 200, 12,868,813 B, valid PDF | `https://sustentabilidade.petrobras.com.br/` | HTTP 403 on automated GET. `robots.txt` has `crawl-delay: 10`. |
| Vale | CVM 4170 / 33.592.510/0001-54 | Relato Integrado & ISSB | Ref: 2025-12-31, Del: 2026-04-15 (Prot: 1505012) | HTTP 200, 4,195 B (ASPX HTML page, no PDF) | `https://vale.com/pt/esg` | HTTP 200. `robots.txt` lists `User-agent: * Disallow:`. Terms page 404. |
| Itaú Unibanco | CVM 19348 / 60.872.504/0001-23 | Relatório de Sustentabilidade & Relato Integrado | Ref: 2025-12-31, Del: 2026-04-30 (Prot: 1514294) | HTTP 200, 4,195 B (ASPX HTML page, no PDF) | `https://www.itau.com.br/relacoes-com-investidores/esg/` | HTTP 200. Terms explicitly forbid automated systems for mass access. |
| WEG | CVM 5410 / 84.429.695/0001-11 | Relato Integrado | Ref: 2025-12-31, Del: 2026-04-27 (Prot: 1508882) | HTTP 200, 4,194 B (ASPX HTML page, no PDF) | `https://ri.weg.net/` | HTTP 200 on root; subpath 404. MZ platform `robots.txt` allows search engines. |
| Ambev | CVM 23264 / 07.526.557/0001-00 | None found in CVM IPE | - | Not present in CVM IPE | `https://ri.ambev.com.br/` | HTTP 200 on root; subpath 404. Terms page 404. |
| Lojas Renner | CVM 19895 / 92.754.738/0001-62 | Relatório de Sustentabilidade & ISSB | Ref: 2025-12-31, Del: 2026-04-29 (Prot: 1511150) | HTTP 200, 4,194 B (ASPX HTML page, no PDF) | `https://lojasrennersa.com.br/sustentabilidade/` | HTTP 200. `robots.txt` specifies rules for AI crawlers; terms page 404. |
| Localiza | CVM 19682 / 16.670.085/0001-55 | Relatório de Sustentabilidade | Ref: 2025-12-31, Del: 2026-09-01 (Prot: 1563384) | HTTP 200, 10,626,842 B, valid PDF (earlier test) | `https://ri.localiza.com/sustentabilidade/` | HTTP 200. MZ platform terms page 200. |
| Suzano | CVM 20249 / 16.404.287/0001-55 | None found in CVM IPE | - | Not present in CVM IPE | `https://centraldesustentabilidade.suzano.com.br/` | HTTP 200. `robots.txt` disallows `/wp-admin/`; terms page 404. |
| Axia Energia (Eletrobras) | CVM 2437 / 00.001.180/0001-26 | Relatório de Sustentabilidade | Ref: 2025-12-31, Del: 2026-05-12 (Prot: 1521005) | HTTP 200, 4,194 B (ASPX HTML page, no PDF) | `https://eletrobras.com/pt/Paginas/Sustentabilidade.aspx` | HTTP 200. `robots.txt` specifies `User-agent: * Disallow: /`. Terms page 404. |
| Totvs | CVM 19992 / 53.113.791/0001-22 | Relato Integrado | Ref: 2025-12-31, Del: 2026-04-30 (Prot: 1514188) | HTTP 200, 4,193 B (ASPX HTML page, no PDF) | `https://ri.totvs.com/` | HTTP 200 on root; subpath 404. Terms page 404. |

## Key Findings

1. **Presence in CVM IPE Metadata**: In this 10-company sample, 8 companies have filings under `"Relatório de Sustentabilidade"`, `"Relato Integrado"`, or `"ISSB"`. 2 companies (Ambev and Suzano) have no filings under these categories.
2. **CVM Direct Download Limitation**: When downloading directly from the CVM IPE link (`frmDownloadDocumento.aspx`), only certain filings (e.g. Petrobras 2025: 12.8 MB, Localiza: 10.6 MB) return the raw PDF stream. Several other links return HTTP 200 with an empty ASP.NET HTML page (~4,195 bytes), which `CvmAdapter` rejects (`CVM answered with a page, not a PDF document`). Automated retrieval via CVM IPE is therefore only partially reliable without active session handling or form navigation.
3. **IR Site Access & Terms Restrictions**:
   - Automated requests to `sustentabilidade.petrobras.com.br` return `HTTP 403 Forbidden`.
   - `itau.com.br/termos-de-uso` explicitly prohibits automated systems/applications from mass querying.
   - `eletrobras.com/robots.txt` contains `User-agent: * Disallow: /`.
   - Several IR specific subpaths return 404 due to yearly URL rotation.
   - Most terms-of-use pages return 404 or provide no explicit license for automated data extraction.

## Options

- **(a) Source and adapter: CVM IPE sustainability categories in `CvmAdapter`**
  - Scope: In `CvmAdapter`, map CVM IPE categories `"Relatório de Sustentabilidade"`, `"Relato Integrado"`, and `"Relatório de Informações Financeiras Relacionadas à Sustentabilidade - Padrão ISSB"` to `filing_type = 'sustainability'`.
  - Open data: Data is published under Open Database License (ODbL).
  - Limitations: Coverage is partial (8/10 in benchmark sample; certain filings fail direct PDF download due to CVM RAD ASPX page responses; depends on existing ticker-to-CNPJ resolution).
  - Maintenance: Low (requires tracking CVM category naming).
- **(b) Web scraping company IR pages**
  - Scope: Build custom web scrapers per company IR site.
  - Limitations: High technical fragility (different CMSs, yearly path changes, 404s) and site access barriers (403 on Petrobras, explicit prohibition on Itaú terms, `Disallow: /` on Eletrobras).
  - Maintenance: High (maintaining multiple independent scrapers).
- **(c) User-provided document URL**
  - Scope: The agent or user supplies the direct URL of a PDF document; the server downloads and indexes it via `DocumentTextService` and `ChunkService`.
  - Limitations: Shifts document discovery to the user or caller; requires host allowlisting in `HttpAdapter`.
  - Maintenance: Very low.
- **(d) Not supported for now**
  - Sustainability reports remain out of scope; queries indicate that sustainability reports are unsupported.

## Recommendation

Present Options (a), (c), and (d) to the owner:
- Option (a) leverages existing CVM ingestion in `CvmAdapter`, but the owner must be informed of the partial download success rate on RAD ASPX links.
- Option (c) provides an escape hatch for documents not downloadable via CVM (such as Ambev, Suzano, or ASPX-gated filings).
- Option (b) is not recommended due to anti-bot challenges, terms prohibitions, and high maintenance.

## Consequences

- No product code is implemented in this PR.
- Issue #15 remains open in `needs-info` status until the owner decides on the path.
