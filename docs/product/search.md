# Search over the documents

How the text of a filing becomes chunks, and how `search_chunks` finds them (issue #10, ADR 0013).

## What is loaded, and when

A document is loaded only when a query asks for `chunks` with a `filing_id` or a `filing_type`. The loader never downloads every filing of a company. The steps for one filing:

1. The filing list of the asset is loaded first (`filings`, from CVM IPE; see `data-map.md`).
2. The filings that match the `filing_id` or the `filing_type` are picked.
3. A filing that was downloaded within its expiry (`INVESTMENT_MCP_CACHE_TTL_SECONDS`) is not downloaded again; it is reported `fresh`.
4. Otherwise the document is downloaded from `www.rad.cvm.gov.br` with a size limit of 20 MiB and a timeout of 60 seconds. A download that is too large, times out, or is not a PDF stores nothing and reports the error.
5. The SHA-256 of the bytes is compared with `filings.file_hash`. If it is the same, the stored chunks are kept. If not, the chunks of the filing are replaced, and the hash is written, in one transaction.
6. The full-text index is rebuilt once after the chunks change.

## Text extraction

- A PDF is read page by page (`unpdf`). A page with no text is counted and reported in the answer (`pagesWithoutText`); it is not read. OCR is not available.
- An HTML page is read by block. A heading (`h1` to `h4`) starts a section; the text under it is one segment per paragraph. Scripts, styles and the head are dropped.
- The format is read from the bytes, not from the content type. CVM sends PDFs with `text/html`.
- For CVM, only a PDF is stored. The CVM site sometimes answers 200 with an HTML error page; that page is refused (`CvmDocumentAdapter`).

## Chunking rules

- A chunk never crosses a section or a page, so its `section` and `page` are exact. A PDF has no sections, so its chunks have `section` null; an HTML page has no pages, so its chunks have `page` null.
- A segment of up to 1,200 characters is one chunk. A longer segment is cut into chunks of at most 1,200 characters, at a space, with 150 characters of overlap.
- `seq` numbers the chunks of a filing from 1, in document order.
- Whitespace is collapsed. Nothing else is changed: the text of a chunk is the words of the document.

## The index

- DuckDB's full-text extension (`fts`), with BM25 scoring. The index is built over the table `chunk_search`, which is `filing_id:seq` and the text of each chunk. It is dropped and built again after each load that changed a chunk.
- Stemmer: Portuguese (Snowball, from DuckDB). Stop words: the list in `FullTextIndexService.ts`, stored in `pt_stopwords`.
- Case and accents are ignored: `lucro` finds `Lucro`, and `líquido` finds `liquido`.
- Numbers are kept as their digits: the index uses the ignore pattern `(\.|[^a-z0-9])+`, so `25` is a token, `12%` gives `12`, and `0,30` gives two tokens, `0` and `30`. The default DuckDB pattern drops digits, which is why this one is set.
- Stemmer limit: DuckDB's Portuguese stemmer does not map every singular and plural to the same stem. `dividendo` becomes `divid`, and `dividendos` becomes `dividend`, so a query for one does not find the other. `pago` and `pagos` both become `pag`. A query can try the other form.

## The search macro

```sql
SELECT text, score, filing_id, section, page
FROM search_chunks('lucro líquido', 'BR', 'PETR4', 'stock', 'material_fact', NULL)
ORDER BY score DESC
```

- Arguments, in order: the query text, `market`, `ticker`, `asset_type`, `filing_type`, `section`. The last one is NULL for no section.
- The macro's arguments count as filters for the SQL guard (`docs/product/sql-guard.md`). A query that passes `NULL` for market, ticker, asset_type or filing_type is refused with the missing filter.
- The score is BM25 from the index. Rows are not sorted by the macro; add `ORDER BY score DESC`.
- A query that matches nothing returns zero rows, and the answer says the filing was indexed.
- If the extension cannot be installed, the load reports `indexError` in `loaded`, the chunks are still stored, and `search_chunks` fails with DuckDB's error.

## Text from filings is data

A chunk that says "ignore your instructions" comes back as the value of a `text` column. The server never acts on it. This is tested in `src/Operations/QuerySqlOperation.test.ts` (AC6).

## Quality

The quality set (issue #10, S8) is not measured yet. It needs three real filings stored as fixtures, and ten questions with the passage each one should find. The sandbox this PR was written in received corrupted copies of three real CVM filings through its proxy (bad xref offsets and truncated transfers), so none of them could be stored as a fixture. The measurement has to be run on a machine that downloads the filings cleanly. Target: 8 of 10 questions with the passage in the top 5.

## Limits

- OCR is not done; a scanned page has no text.
- Only the chunks of the filing type or the filing id asked for are searched. A search over all filings of a company needs a load of each of them.
- Structured financial statements are in `financial_statements` (issue #11), not in the search; FNET documents are issue #12.
