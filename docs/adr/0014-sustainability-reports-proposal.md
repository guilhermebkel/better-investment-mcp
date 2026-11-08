# Sustainability reports: CVM IPE evidence, IR site validation, and options

Date: 2026-11-08. Status: proposed. The owner chooses the path; no product code is built before approval.

Issue #15 asks where the latest sustainability reports of listed companies are published, whether a rule can find them reliably, and which path the server should take. This ADR updates the initial lead research with actual data measurements from CVM IPE open data and live web access tests against 10 target companies.

## Correction history

The initial draft of this ADR relied on search engine snippets and stated that CVM IPE had no category named "Relatório de Sustentabilidade" and that fewer than 11 reports existed under generic communications. That claim was inaccurate. Direct analysis of CVM open data files (`ipe_cia_aberta_2025.csv` and `ipe_cia_aberta_2026.csv`, updated daily under ODbL) revealed dedicated regulatory categories:

- **"Relatório de Sustentabilidade"**: 190 filings in 2025, 153 filings in 2026.
- **"Relato Integrado"**: 49 filings in 2025, 55 filings in 2026.
- **"Relatório de Informações Financeiras Relacionadas à Sustentabilidade - Padrão ISSB"**: 6 filings in 2025, 10 filings in 2026.

7 out of the 10 target companies publish their complete sustainability or integrated annual reports directly to CVM under these formal categories.

## Verification of the 10 target companies

Each company was investigated across both (1) the official CVM IPE dataset and (2) its investor relations (IR) / corporate sustainability website:

| Company | Sector | CVM IPE Route (Proven) | IR / Company Site (Validated) | IR Robots / Terms Status | Confirmed Latest Report (as of 2026-11-08) |
| --- | --- | --- | --- | --- | --- |
| **Petrobras** | Energy | Category: "Relatório de Sustentabilidade". Ref: 2025-12-31, Del: 2026-06-22 (Prot: 1537066). Direct PDF confirmed (`009512000101011.pdf`). | `sustentabilidade.petrobras.com.br` / `api.mziq.com` | Automated fetch blocked with HTTP 403 (Cloudflare/WAF). Robots has `crawl-delay: 10`. | 2025 Sustainability Report (published June 2026 on CVM) |
| **Vale** | Mining | Categories: "Relato Integrado" (Ref: 2025-12-31, Del: 2026-04-15, Prot: 1505012) and "ISSB" (Del: 2026-06-15, Prot: 1534376). Direct PDF confirmed. | `vale.com/pt/esg`, `vale.com/investidores` | `vale.com/robots.txt` has `User-agent: * Disallow:`, crawl-delay 10. | 2025 Integrated Report & ISSB Financial Report (published April/June 2026 on CVM) |
| **Itaú Unibanco** | Financial | Absent from CVM sustainability categories. Reports published only as generic "Comunicado ao Mercado". | `www.itau.com.br/relacoes-com-investidores/` | `itau.com.br/robots.txt` allows `/`, but general terms forbid unauthorized automated indexing. | 2025 ESG Report on IR site |
| **WEG** | Industry | Category: "Relato Integrado". Ref: 2025-12-31, Del: 2026-04-27 (Prot: 1508882). Direct PDF confirmed. | `ri.weg.net` (MZ Group platform) | MZ platform robots.txt allows only specific search bots (Googlebot, Bingbot). | 2025 Integrated Report (published April 2026 on CVM) |
| **Ambev** | Beverages | Absent from CVM sustainability categories. | `ri.ambev.com.br` (MZ Group platform) | MZ platform robots.txt allows only specific search bots. | 2024/2025 Annual & Sustainability Report on IR site |
| **Lojas Renner** | Retail | Categories: "Relatório de Sustentabilidade" (Ref: 2025-12-31, Del: 2026-04-29, Prot: 1511150) and "ISSB" (Del: 2026-07-17, Prot: 1545750). | `lojasrennersa.com.br` | Robots.txt allows only OAI-SearchBot and ChatGPT-User. No general license. | 2025 Sustainability Report (published April 2026 on CVM) |
| **Localiza** | Rental | Category: "Relatório de Sustentabilidade". Ref: 2025-12-31, Del: 2026-09-01 (Prot: 1563384). Direct PDF confirmed. | `ri.localiza.com` (MZ Group platform) | MZ platform robots.txt allows only specific search bots. | 2025 Sustainability Report (published September 2026 on CVM) |
| **Suzano** | Pulp & Paper | Absent from CVM sustainability categories. | `centraldesustentabilidade.suzano.com.br`, `suzano.com.br` | WordPress robots.txt allows `/`, but no machine-readable API or data license. | 2024/2025 Sustainability Center summary |
| **Axia Energia (Eletrobras)** | Utilities | Category: "Relatório de Sustentabilidade". Ref: 2025-12-31, Del: 2026-05-12 (Prot: 1521005). Direct PDF confirmed. | `axia.com.br`, `www.eletrobras.com` | `www.eletrobras.com/robots.txt` **explicitly disallows all crawlers**: `User-agent: * Disallow: /`. | 2025 Sustainability Report (published May 2026 on CVM) |
| **Totvs** | Software | Category: "Relato Integrado". Ref: 2025-12-31, Del: 2026-04-30 (Prot: 1514188). Direct PDF confirmed. | `ri.totvs.com` (MZ Group platform) | MZ platform robots.txt allows only specific search bots. | 2025 Integrated Report (published April 2026 on CVM) |

## Key findings

1. **CVM IPE provides 70% coverage of top companies out of the box.** 7 of the 10 target companies file their full annual sustainability or integrated reports directly with CVM under dedicated categories. These documents are distributed as standardized PDFs via CVM's RAD portal (`www.rad.cvm.gov.br`), which `CvmDocumentAdapter` already downloads and indexes using `DocumentTextService` without custom scraping.
2. **IR scraping is legally and technically problematic:**
   - Eletrobras (`www.eletrobras.com`) explicitly forbids all automated access via `robots.txt` (`Disallow: /`).
   - Petrobras blocks programmatic HTTP clients with `HTTP 403`.
   - Four companies host their IR on MZ Group portals that only permit major commercial search engine bots.
   - Maintenance burden of option (b) is severe: 10 different sites, proprietary CMS layouts, annual link rotations, and absence of automated access terms.

## Options

- **(a) Source and adapter: CVM IPE sustainability categories.**
  - Scope: In `CvmFilingAdapter`, map CVM IPE categories `"Relatório de Sustentabilidade"`, `"Relato Integrado"`, and `"Relatório de Informações Financeiras Relacionadas à Sustentabilidade - Padrão ISSB"` to `filing_type = 'sustainability'`.
  - Legal: 100% compliant under CVM's Open Database License (ODbL).
  - Infrastructure: Uses existing `CvmDocumentAdapter`, `DocumentTextService`, and DuckDB `chunks` search pipeline.
  - Coverage: Covers 70% of major listed companies (Petrobras, Vale, WEG, Renner, Localiza, Axia, Totvs) and hundreds of other issuers in Brazil.
  - Maintenance: Near zero.
- **(b) Web scraping company IR pages.**
  - Scope: Build custom scrapers for company IR portals.
  - Legal: High risk. Multiple sites explicitly forbid automated access (`Disallow: /` on Eletrobras, 403 on Petrobras, restricted bots on MZ Group).
  - Maintenance: Severe. Ongoing updates required for multiple independent HTML structures.
- **(c) User-provided document URL.**
  - Scope: Allow the agent or user to supply a direct PDF URL for companies not filing in CVM (e.g. Itaú, Ambev, Suzano). The server downloads the file and indexes it in `chunks`.
  - Legal: Relies on user discretion for external URLs; requires explicit host whitelisting in `HttpAdapter`.
  - Maintenance: Very low; no site-specific rules to maintain.
- **(d) Not supported for now.**
  - Sustainability queries inform the agent that sustainability reports are not currently indexed.

## Recommendation

Implement **Option (a)** first:
1. It leverages the existing, fully-tested CVM ingestion pipeline and CVM open data under ODbL.
2. It immediately covers 7 of the 10 benchmark companies (and >350 filings across the market in 2025-2026).
3. If complete coverage for companies that do not file under CVM sustainability categories (such as Itaú, Ambev, Suzano) is required, supplement with **Option (c)** (user-provided document URL).
4. **Reject Option (b)** entirely due to explicit legal restrictions (`Disallow: /`), anti-bot challenges (403), and excessive maintenance.

## Consequences

- No product code is changed in this round.
- Issue #15 remains open with `needs-info` until the owner chooses between (a) only, or (a) + (c).
- Once approved, implementation of (a) requires updating the category mapping in `CvmFilingAdapter` and registering the category in `docs/product/data-map.md`.
