# Provider defaults, streaming of every CVM file, and company disclosures

Date: 2026-11-09.

The owner runs the server for a personal portfolio and does not want to set provider variables to get data. Large CVM files were read in memory. The reference form (FRE), the securities holdings (VLMO) and the governance (CGVN) were not loaded.

## Decision

- **Defaults.** Each category has a default setting in `ProviderRegistryService`; a provider variable is optional and replaces it. A default with a second vendor names it as the fallback, used automatically when the first one fails (yfinance, then Yahoo for quotes and dividends).
- **Streaming.** Every CVM zip or CSV is downloaded by `CvmUtil.downloadCvmFile` to a temporary file owned by the call, and read as a stream (`ZipFileUtil.openEntry`, `createReadStream`). The temporary file is removed when the work ends. The PDF documents of filings are still read in memory, because a PDF parser needs the whole file; they are capped by size.
- **Disclosures.** The FRE, VLMO and CGVN yearly zips are read for the company's CNPJ into `company_disclosures`. Each row keeps its section, reference date, version and the whole row as JSON, so no column is dropped. Every version is kept; a query takes the highest version of a reference date.

## Not decided here

- The default period of disclosures is the last three years, the same as the other yearly CVM sources. A longer history is not read by default.
- A PDF of a filing is not streamed (see above).
