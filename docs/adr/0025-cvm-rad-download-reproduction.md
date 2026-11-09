# CVM RAD downloads: what the reproduction shows

Date: 2026-11-09. Status: accepted. It records evidence for issue #27; it changes no product behavior beyond the error text.

Issue #27 says that some `Link_Download` URLs of the IPE file answered HTTP 200 with an HTML page of about 4 KB, and asks for a diagnosis. This ADR records a reproduction of the eight cases the issue lists.

## Method

- The links come from the CVM IPE yearly zips (`ipe_cia_aberta_2025.zip`, `ipe_cia_aberta_2026.zip`), taken from the row whose `numProtocolo` matches the protocol the issue gives. The link is requested exactly as the IPE file gives it.
- One plain `GET` per link, with curl, no cookies, no session, no extra headers. Responses were stored and inspected outside the repository.
- The IPE rows and the links are public CVM open data (ODbL).

## Results

| Protocol | IPE category | Status | Content-Type | Bytes received | First bytes | Transfer |
| --- | --- | --- | --- | --- | --- | --- |
| 1390774 | Relatório de Sustentabilidade (2025) | 200 | text/html | 12,209,207 | `%PDF-1.7` | cut before the declared end |
| 1521005 | Relatório de Sustentabilidade (2026) | 200 | text/html | 30,296,284 | `%PDF-1.7` | cut before the declared end |
| 1563384 | Relatório de Sustentabilidade (2026) | 200 | text/html | 10,102,303 | `%PDF-1.6` | cut before the declared end |
| 1505012 | Relato Integrado (2026) | 200 | text/html | 22,168,491 | `%PDF-1.4` | cut before the declared end |
| 1514188 | Relato Integrado (2026) | 200 | text/html | 27,195,080 | `%PDF-1.7` | cut before the declared end |
| 1514294 | Relatório de Sustentabilidade (2026) | 200 | text/html | 51,761,802 | `%PDF-1.4` | cut before the declared end |
| 1508882 | Relato Integrado (2026) | 200 | text/html | 25,393,324 | `%PDF-1.7` | cut before the declared end |
| 1511150 | Relatório de Sustentabilidade (2026) | 200 | text/html | 13,292,201 | `%PDF-1.7` | cut before the declared end |

In none of the eight cases was an HTML page received. Every answer started with the PDF signature, but was labelled `text/html`, had `Transfer-Encoding: chunked`, `Content-disposition: attachment; filename=<cnpj>.pdf`, and no `Content-Length`. Each transfer ended with a truncation error from the client (`transfer closed with outstanding read data remaining`).

A second attempt for protocol 1390774 received 12,355,642 bytes, against 12,345,744 in the first; the bytes are not the same. The truncation is therefore not a stable property of the file at this link.

## What this shows and what it does not

- **Proven:** the links answer 200 with PDF bytes in this environment, and the body is cut off at a size that changes between attempts. Five of the eight answers already exceed the 20 MiB document limit, so the limit would refuse them whatever their content.
- **Not proven:** the HTML page the issue describes. It was not reproduced with these eight links. The issue's HTML cases (Vale 1505012, WEG 1508882, and others) answer with PDF bytes here.
- **Not proven:** the cause of the truncation. The egress proxy records no relay failure for these hosts (`recentRelayFailures` is empty). It could be the proxy, the client, or CVM; the evidence does not decide.
- **Not a URL problem:** the link in the IPE row is the one the adapter uses; no decoded, malformed or alternative public link of the same document was found to change the answer. No fix in the adapter follows from this evidence (issue #27, S2 does not apply).

## Decision

1. Do not add sessions, cookies, ViewState replay, hidden endpoints, or any bypass (issue #27, S3).
2. Keep the refusal of an answer that is not a PDF or a form zip (`CvmDocumentAdapter`). Its message does not say that a login or a block was found, because the evidence shows no such thing.
3. A failed document names its filing in the load entry (`filing <filing_id>: ...`); the other filings of the query still load. The filing row is left as it was and no chunk is written.

## Open risk

A download that is cut off can still start with `%PDF`, so `CvmDocumentAdapter` would accept a truncated PDF. The HTTP adapter checks the declared `Content-Length`, but these answers have none. A check of the PDF end-of-file marker, or a check that the byte count matches a declared length, would close this gap. It is not implemented here: the issue scopes the work to diagnosis, and the cause of the truncation is not known. A follow-up issue should decide it.
