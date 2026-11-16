# CVM RAD documents are downloaded with a browser user agent

Date: 2026-11-16.

Status: accepted for the issue #61 research (phase 3). Measured on 2026-11-16 from the sandbox, on a sample of eight documents. Reconsider it if RAD starts refusing the identity or cutting transfers again.

## The problem

RAD (`www.rad.cvm.gov.br`) cut the transfers of the DFP and ITR zips (ADR 0045): the zip arrived without its end, and its rendered PDF could not be read. Until now, the server asked for these documents with the client identity of all its adapters, `PostmanRuntime/7.44.1` (`HttpAdapter.USER_AGENT`). The same cut was seen with curl's default identity.

## What was measured

| Document (RAD number) | Identity | Result |
| --- | --- | --- |
| LREN3 DFP 2025 (`155101`) | curl default | cut at 8,694,356 bytes |
| LREN3 DFP 2025 (`155101`) | `PostmanRuntime/7.44.1` | cut at 8,575,038 bytes |
| LREN3 DFP 2025 (`155101`) | browser string | complete zip, 9,169,126 bytes; rendered PDF complete (92 pages) |
| PETR4 DFP 2025 (`155122`) | browser string | complete zip, 23,222,858 bytes |
| ITUB4 DFP 2025 (`154591`) | browser string | complete zip, 8,318,298 bytes |
| MGLU3 DFP 2025 (`155314`) | browser string | complete zip, 8,270,451 bytes |
| WEGE3 DFP 2025 (`154872`) | browser string | complete zip, 7,177,767 bytes |
| TOTS3 DFP 2025 (`154722`) | browser string | first try failed, second try complete, 8,338,142 bytes |
| ITUB4 ITR 2026-09 (`161944`) | browser string | complete zip, 13,045,550 bytes |

Seven of the eight documents came whole with the browser string. Before, with the other identities and the same network path, none of the large documents came whole. The same proxy carried a 12.8 MB file from `dados.cvm.gov.br` in 1.3 s (ADR 0045), so the path itself is not the problem.

## The decision

- The RAD document route (`CvmDocumentAdapter`, through `cvmDocumentHttp`) sends `CvmDocumentAdapter.USER_AGENT`, a generic browser string. The other adapters keep the default identity.
- `HttpOptions` gains an optional `userAgent`. The default stays `HttpAdapter.USER_AGENT`, so no other adapter changes.
- The string names no person, project or account (AGENTS.md, privacy).

## Limits and what this does not claim

- Eight documents on one network path, on one day. It is not a proof of cause: the cut may depend on time, on RAD's load, or on the document. The one failure in the browser batch (TOTS3, first try) came whole on the second try.
- No block was met. RAD answered 200 with the zip in every case; nothing was refused, no captcha or login was shown, and nothing was bypassed. A browser identity is only the one RAD answered whole.
- If RAD starts answering the browser identity with a refusal or a captcha, the decision is void: the adapter stops and the document is not downloaded.

## Consequence for issue #61 (phase 3)

With the complete rendered PDFs of several DFPs (LREN3, PETR4, ITUB4, MGLU3, WEGE3, TOTS3, with the bank ITUB4 among them), the containment question of ADR 0045 can be measured, and it is measured in the research record that follows this ADR.
