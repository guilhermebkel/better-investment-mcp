# The management report and the notes in the DFP zip (research, outcome not decided)

Date: 2026-11-15.

Status: research incomplete. The question of issue #61, Phase 3 (is the management report or the notes text inside the rendered DFP PDF?) is **not answered**, so Phase 4 is **not decided**. The question stays open; this ADR records what was measured and why it could not be finished.

## What was measured

Four DFPs of reference year 2025 were downloaded from RAD on 2026-11-15, with the server's own document route (`frmDownloadDocumento.aspx`), and the zips were read from their local headers, because the central directory at the end was missing in every one. One ITR was also downloaded, and one DFP (WEGE3) answered a web page.

| Stock | `ID_DOC` | Zip bytes received | XML (first entry) | Attachments in the XML (group, name, bytes) | Rendered PDF (second entry) |
| --- | --- | --- | --- | --- | --- |
| TOTS3 | 154722 | 7,747,507 | complete, CRC ok | 1653 management report, 1,107,384; 412 notes, 2,740,443 | declared 6,039,684, received 5,517,007: cut |
| ITUB4 (bank) | 154591 | 7,711,623 | complete, CRC ok | 1653 management report, 598,731; 412 notes, 1,236,581; 413 ITR projections, 198,965 | declared 6,361,121, received 5,817,249: cut |
| MGLU3 | 155314 | 7,697,130 | complete, CRC ok | 1653 management report, 1,895,895; 412 notes, 945,176 | declared 5,646,243, received 5,138,251: cut |
| PETR4 | 155122 | 22,536,223 | complete, CRC ok | 1653 management report, 7,833,622; 412 notes, 2,533,076; 413 ITR projections, 236,942; 416 capital budget, 48,066 | declared 13,204,458, received 12,581,779: cut |
| WEGE3 | 154872 | 297 | not read | not read | the server answered a web page |
| ITUB4 ITR | 161944 | 12,394,198 | not analysed here | not analysed here | not analysed here |

Each attachment is a complete PDF (`%PDF-`), and its text was extracted with `unpdf`: between 7 and 2,134 sentences of 8 words or more per attachment, and 20 of them sampled in most cases.

## The group numbers (S26)

The attachment block of the XML gives `NumeroGrupoRelacionado` for each attachment. The same numbers meant the same documents in all four companies: **1653** is the management report, **412** the notes, **413** the ITR projections, and **416** the capital budget. The names confirm it in every case.

## Why the containment question was not answered (S25)

Containment needs the rendered PDF, which is the second entry of the zip. In all four DFPs the zip was cut before its end, so the rendered PDF lacks its tail (the cross-reference table and the trailer). `unpdf` rejected all four with `Invalid PDF structure`, so no sentence of an attachment could be looked for in the rendered PDF, and no count was made.

The attachments themselves are complete, and they are read from the XML. What is unknown is whether the rendered PDF holds the same text. Without it, the decision of Phase 4 ("at least one attachment of type management report or notes is not contained in its rendered PDF") cannot be made in either direction.

## What this means for the server

- A DFP zip cut by RAD leaves its rendered PDF unreadable. `ZipDocumentService` reads each PDF entry of the zip and does not catch the reader's error, so by the code the whole filing fails to load. This was read from the code and the reader error (`Invalid PDF structure`), not from a load of these filings on the server. The rendered PDFs of the four DFPs were short of their declared size by 0.5 to 0.6 MB. ADR 0025 records RAD cutting DFP downloads at about 7.7 MB.
- The XML attachments of a DFP are complete when the cut comes after them, so a reader of the XML would still get the management report and the notes of those four documents. That path is not built; Phase 4 would build it only after the containment question is answered.

## Next step

Phase 3 is open. To answer it, a DFP whose rendered PDF arrives complete is needed (RAD does not give one here), or an alternative source of the rendered PDF. Until then Phase 4 stays undecided, and the issue is closed only when it is decided.
