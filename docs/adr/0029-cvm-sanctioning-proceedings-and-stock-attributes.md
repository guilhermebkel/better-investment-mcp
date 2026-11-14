# CVM sanctioning proceedings and the stock attributes of CVM's FCA filing

Date: 2026-11-14.

Status: accepted; implemented with this decision (issue #41, phases 1 and 2).

Two CVM sources fill fields that the registry does not carry: the company's IR site, activity and previous legal name (the FCA general form, `fca_cia_aberta_geral`), and the sanctioning proceedings against companies and their officers (`processo_sancionador.zip`). CVM stays the primary source for every field (ADR 0015).

## Decision

- **Stock attributes.** The registry load of a stock reads the FCA general form of the latest year that has the company, and within it the row with the latest reference date, then the highest version. It writes `asset_attribute` rows `ir_site` (`Pagina_Web`), `activity_description` (`Descricao_Atividade`), `activity_sector` (`Setor_Atividade`) and `previous_legal_name` (`Nome_Empresarial_Anterior`). A column CVM leaves empty writes no row.
- **Proceedings.** A new category `proceedings` and table `asset_proceedings`, one row per case and defendant, with the case number, the subject and summary, the opening date, the current phase and subphase, the last movement, and the defendant's latest status and its date. The provider setting is `INVESTMENT_MCP_PROCEEDINGS_PROVIDER`, with the default `BR:cvm`.
- **Name rule (P3).** A defendant is linked to a stock only when its name equals the company's registry name (`DENOM_SOCIAL` of `cad_cia_aberta`) or its previous legal name, after one normalization: accents, case and repeated spaces. No partial or fuzzy match is made. A defendant that does not match is not stored, and a case with no linked defendant is not stored.
- **Period.** A proceeding is an event; a period load places it by `opened_time`.
- **Licence.** The CKAN package `processo-sancionador` on dados.cvm.gov.br names the licence `odc-odbl` (Open Data Commons Open Database License, ODbL), read on 2026-11-14. ODbL asks for attribution and, for a shared derived database, the same licence. The server answers queries and does not share the database; the owner confirms this reading.
- **Defendants.** The file has no CNPJ: a defendant is a name only. The server links it by the name rule above and says nothing more.

## Consequences

- The schema version is 10 (the version of this change, not yet released), so a store from an earlier version is rebuilt.
- A defendant of a different company with the same name is linked to the stock with that name. The name rule accepts this trade-off; the defendant row shows the name as CVM wrote it.
- A proceeding of a company that changed its name is found only through the previous legal name CVM gives in the FCA form.

## Rejected

- Partial matching ("PETROBRAS" in "PETROBRAS DISTRIBUIDORA S.A."): it links a company to a proceeding of another company.
- Linking through the officer's CPF: the file has no CPF.
