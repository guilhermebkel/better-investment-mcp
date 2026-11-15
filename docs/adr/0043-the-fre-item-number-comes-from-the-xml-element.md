# The FRE item number comes from the XML element, not from the file name

Date: 2026-11-15.

Status: accepted by the owner on 2026-11-15 (issue #61, bug found in the measurement). It replaces the rule of ADR 0024 that took the item number from the company's file name.

## The problem

The FRE XML holds, inside each section tag, one element per item, and the element holds the item's PDF: `<AtividadesEmissor><InfoSegmentosOperacionais><NomeArquivoPdf>IUH - 1.3.pdf</NomeArquivoPdf><ImagemObjetoArquivoPdf>…</ImagemObjetoArquivoPdf></InfoSegmentosOperacionais>`. The element names are CVM's. The company writes the label of the PDF, and the label can be anything. Until now the server took the item number from the label.

Measured on 2026-11-15 on the XMLs of five forms (TOTS3, WEGE3, PETR4, ITUB4, MGLU3, reference year 2026): 98 of the 381 items that have a PDF had a wrong number. Examples:

| Stock | Items with a wrong number | Labels as written | What the guide filter returned |
| --- | --- | --- | --- |
| ITUB4 | 76 of 76 | `IUH - 1.3`, `FRE - IUH 1.9 (V4)`, `FRE - IUH Anual 4.2` | `IUH` or `FRE` |
| WEGE3 | 18 of 77 | `1.01` to `1.09`, `6.5new`, `8.20v01`, `9.4. [ok]`, `12.2.[ok]` | `1.01`, `6.5new`, `9.4.` |
| PETR4 | 4 of 76 | `2.4_Item 6.5_FRE 2026_…` (item 6.5), `4.4_Item 7.8_FRE 2026_limpa` (item 7.8) | `2.4`, `4.4` |

The PETR4 case is the worst: a filter on `2.4` returned item 6.5 with no warning.

## The rule

The item number is read from the element that holds the item's PDF, inside its section tag, through the table in `src/Services/FormReferenceService.ts` (`SECTION_TO_ELEMENT_TO_ITEM`). The number is written as CVM writes it (`1.4`, `8.20`). A PDF directly under its section tag, or an element that is not in the table, has no number: the item is NULL, the text is still stored, and the load does not fail. The item number never comes from the file name.

The FRE XML is the one whose root is `XmlFormularioReferencia`. A real zip also holds `FormularioCadastral.xml`, and the server does not take the first XML of the zip.

The chunks carry the number in a new column `item` (`asset_filing_chunks`, schema version 13). `section` keeps its value (`<tag> <label>`) so a query on the label still works.

## The table and its sources

The table lists the element of each item for the 13 section tags. Its rows were read from the XMLs of the five forms above. The rows of 13.1 (`DeclaracaoDiretorPresidenteRelacoes`, `DeclaracaoDiretorPresidente`, `DeclaracaoDiretorRelacoes`) and of 13.2 (the three elements ending in `132`) were inferred from the element names: the five forms did not show them with a filled label, so they are **to be checked** against CVM's reference form layout (CVM Resolution 80, annex C) or another real form. Until that check, a load of those elements is recorded as inferred in this ADR and the table comment.

## Consequences

- The four inferred rows are the only numbers not checked against a label. A wrong row here gives a wrong number with no warning, so the check is the next step for this ADR.
- The guides teach `item = '<number>'`, not `split_part` on `section`. `item` is never a prefix match: `item LIKE '8.1%'` also matches 8.10 to 8.19.
- Filings loaded before schema version 13 are replaced by the next load, as for any schema change.
