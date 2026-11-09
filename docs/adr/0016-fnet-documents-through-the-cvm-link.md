# FNET documents are read through the CVM link

Date: 2026-11-08.

The FII management reports listed in the CVM eventual fund file (issue #28, AC3) link to FNET, which hosts the PDFs. Reading their text (issue #12) needs the server to download from FNET.

## Decision

- A document is downloaded from `fnet.bmfbovespa.com.br` only when its link comes from the CVM eventual fund file, over https, with the same size limit and timeout as the CVM documents (`CvmDocumentAdapter`).
- The origin of the row stays `cvm` (CVM indexes the link); the host that serves the PDF is the link itself, shown in `filings.url`.
- No request is made to FNET for any other purpose: no search, no listing, no login.

## Open point

The FNET host stays enabled only for the links CVM publishes.
