# CVM is the primary source of what it carries, loaded by period and kept by version

Date: 2026-11-08.

Issue #28 makes CVM open data the primary source for stocks and FIIs. Other sources (StatusInvest, Yahoo Finance) are used only for a value CVM does not carry. The study of the 54 CVM datasets is the reference (`docs/product/data-map.md`, CVM consumption map).

## Decision

- **Primary source per field.** A field is taken from CVM when CVM carries it for that entity and period. A field CVM does not carry is not replaced silently: it is null, and the source of the row says so.
- **No fallback on a CVM failure.** A failure of a CVM load (HTTP error, blocked or refused request, a file that cannot be read, an unmapped ticker) is reported with its class and never falls back to another source. The loader enforces this for `CvmFailureError` (`LoaderService.fetchWithFallback`) and a test proves it (AC7).
- **Tickers.** A stock ticker maps to its CNPJ through the CVM company list (`Codigo_Negociacao`). A FII ticker maps through a short list in `CvmTickerAdapter`, where each fund is checked against CVM's own name; today the list has IRDM11. Any other ticker is pending: the load names it and no CNPJ is guessed from a name or an ISIN.
- **Periods.** The SQL guard reads a period filter on the reference-period column of `financial_statements` (`period_end`), `fii_monthly` (`period`) and `filings` (`reference_date`). The loader loads the years of the period. A query with no period loads the last three years. One load covers at most 10 years, because each yearly file is tens of megabytes.
- **Replacement by window.** A period load replaces only the rows of its own window, so the rows of other periods stay in the store. A window is fresh only when a fresh load covers it.
- **Versions.** Each CVM file downloaded is recorded in `cvm_files` with its URL, year, SHA-256 hash, size and time; a new hash for a known URL makes the new copy current and keeps the old record. Rows carry CVM's `VERSAO` and the file they came from (`source_file`).
- **Query parameters.** No new tool or parameter: the period is read from the `WHERE` of `query_sql`, as the issue allowed when the existing tool can express it.

## Decisions on the open questions of issue #28

- The join of IRDM11 and IRIM11 is not decided: each ticker keeps its own history, and IRIM11 has no CNPJ yet (pending).
- Phase 2 datasets (CDA, daily NAV, FIDC, FIP, FIAGRO, securitization) are not built: no use case in the issue asks for them.
- `query_sql` needs no new parameter: the period filters are read from the SQL.

## Consequences and deviations

- **Versions are kept as records, not as rows.** AC5 asks that the new version of a changed file is kept alongside the old one. The old file stays on record in `cvm_files` (`is_current = false`), but the rows of a period hold only the current version, so a query never counts a restated value twice. Keeping the old rows beside the new ones would need a default selection that the SQL guard does not yet apply; that is a follow-up decision.
- **FII monthly data is CVM-only.** Merging CVM and StatusInvest field by field (P1, P2) needs a column-level source; StatusInvest is blocked from this server (ADR 0010), so the columns CVM does not carry stay null. A field-level merge is a follow-up.
- **A FII ticker needs a curated pair.** Until the CVM datasets carry a ticker for funds, each new FII is added to the list by hand with its CVM name, as a reviewed change.
