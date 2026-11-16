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

## Further attempts (2026-11-16)

Every route tried to get a DFP whose rendered PDF arrives complete:

- The same document over `https` (the `http` address answers 302 to it). It answered 200 with a zip header, and the body was cut (`transfer closed with outstanding read data remaining`). PETR4 (`155122`) was cut at 22,749,102 bytes in one try and at 22,529,695 in another.
- `Range` requests are ignored: the server answers 200 with the whole body, so an interrupted transfer cannot be resumed.
- HTTP/1.1 forced, `Connection: close`, and the older `/ENET/` address: the answers were 162 or 297 bytes, the RAD download service saying it is unavailable or busy (`127.0.0.1:8182/Download/DownloadDocumento.svc`), not a document.
- Smaller DFPs of 2025 from other sectors (ABEV3 `154733`, BRSR6 `154711` (a bank), LREN3 `155101`, TAEE11 `155448`, VALE3 `154745`), with four tries each over `https`: none of the five zips opened. They were cut at 8,432,973 to 16,424,666 bytes, and ABEV3 answered the busy message. One timed transfer (LREN3) received 8,557,590 bytes in 37.6 s at 228 KB/s and was cut.

The cut does not depend on the size of the document alone: a zip of 8.4 MB and one of 22.5 MB are both cut. The cause is on RAD's side or on the path to it, and this machine cannot change it. So no complete rendered PDF of a DFP was obtained, and the question of this ADR is still open.

## Status

Phase 3 remains open, and phase 4 is not decided. What would close it: a complete copy of a DFP's rendered PDF (from another network path or another moment when RAD does not cut), or the rendered PDF of a document from another source. This ADR does not decide containment, so the research is not closed.

## Why the RAD downloads are cut (analysis, 2026-11-16)

Evidence gathered on 2026-11-16. What is measured, and what is not known:

- **The cut is specific to RAD.** `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/DADOS/dfp_cia_aberta_2025.zip` (12,863,177 bytes) went through the same sandbox proxy in 1.3 s and was a complete, valid zip. The proxy is not cutting large transfers in general.
- **The proxy records the RAD failures.** The proxy status (`/__agentproxy/status`, `recentRelayFailures`) has an entry for `www.rad.cvm.gov.br:443`: `ws_closed_mid_exchange`, tunnel closed with code 1006 after 10 s, 517 B sent, 39 B received, client reading, 0 B still queued in the relay. The relay had delivered everything it held, so the tunnel closed on the far side of the relay, between the proxy and RAD.
- **RAD is much slower.** Transfers from RAD ran at about 228 KB/s (an 8.5 MB zip took 37.6 s and was cut), against about 10 MB/s from `dados.cvm.gov.br`.
- **RAD answers with its own back-end's errors.** Some answers say that `127.0.0.1:8182/Download/DownloadDocumento.svc` could not be activated or is unavailable or busy. That address is internal to RAD, and the response comes from a `server: BigIP` front (a load balancer). So a request reaches an internal download service, which is sometimes unavailable, and the external connection is closed during long transfers.

Not known: which RAD component decides to close a transfer (the front, the internal service, or a timeout there), and why it does so only for some documents and times. The data above does not identify it, and RAD is not under this project's control. The conclusion for this ADR is unchanged: no complete rendered PDF of a DFP was obtained, so the containment question is still open.

## Outcome of the research (2026-11-16)

With a browser identity (ADR 0046), seven complete zips came whole: LREN3, PETR4, ITUB4 (a bank, and its ITR), MGLU3, WEGE3 and TOTS3. Their rendered PDFs are complete (they end with `%%EOF`, and they have their `startxref` and trailer; 64 to 288 pages). The check is the one of S25: 20 sentences of 8 words or more, spread over each attachment, are looked for in the text of the complete rendered PDF. A contained attachment has at least 18 of the 20.

| Stock (`ID_DOC`) | Attachment (group) | Sentences found in the rendered PDF |
| --- | --- | --- |
| ITUB4 (`154591`) | management report (1653) | 18 of 20 |
| ITUB4 | notes (412) | 20 of 20 |
| ITUB4 | ITR projections (413) | 16 of 16 |
| LREN3 (`155101`) | management report (1653) | 20 of 20 |
| LREN3 | notes (412) | 20 of 20 |
| MGLU3 (`155314`) | management report (1653) | 20 of 20 |
| MGLU3 | notes (412) | **2 of 20** |
| PETR4 (`155122`) | management report (1653) | 18 of 20 |
| PETR4 | notes (412) | 20 of 20 |
| PETR4 | ITR projections (413) | 18 of 20 |
| TOTS3 (`154722`) | management report (1653) | 18 of 20 |
| TOTS3 | notes (412) | 18 of 20 |
| WEGE3 (`154872`) | management report (1653) | 20 of 20 |
| WEGE3 | notes (412) | 20 of 20 |

The MGLU3 notes are a complete document of the financial statements with the notes (79 pages, about 193 thousand characters). The rendered PDF of the same DFP has 64 pages and does not contain their text (for example, the title "Demonstrações Financeiras 31 de dezembro" is not in the rendered PDF). The mismatch is therefore real, not an extraction artifact.

## Decision (phase 4 runs)

- At least one checked attachment of type notes (group 412) is not contained in its rendered PDF, so phase 4 runs.
- The management report (1653) is contained in every checked document (18 or more of 20 sentences), so it is not read again (S30).
- The notes (412) are read from the XML of each DFP and ITR zip that holds them, with the section `NotasExplicativas` (S29). The ITR projections and the capital budget (413, 416) are not read in this phase: the sample has them contained, or too few sentences to decide.
- A non-PDF attachment is skipped and counted, the other attachments are read (S31).
