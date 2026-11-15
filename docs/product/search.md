# Search over the documents

How the text of a filing becomes chunks, and how `search_chunks` finds them (issue #10, ADR 0013).

## What is loaded, and when

A document is loaded only when a query asks for `asset_filing_chunks` with a `filing_id` or a `document_type`. The loader never downloads every filing of a company. The steps for one filing:

1. The filing list of the asset is loaded first. A disclosure type (`fre`, `vlmo`, `cgvn`) is listed by the `disclosures` category (CVM's reference form, securities holdings and governance rows); any other type is listed by the `filings` category (CVM IPE, ITR and DFP; see `data-map.md`). A `filing_id` that the first list does not have is looked for in the other list too (issue #42, S1).
2. The filings that match the `filing_id` or the `document_type` are picked.
3. A filing that was downloaded within its expiry (`INVESTMENT_MCP_CACHE_TTL_SECONDS`) is not downloaded again; it is reported `fresh`.
4. Otherwise the document is downloaded from `www.rad.cvm.gov.br` with a size limit of 100 MiB and a timeout of 60 seconds. A download that is too large, times out, or is not a PDF stores nothing and reports the error.
5. The SHA-256 of the bytes is compared with `filings.file_hash`. If it is the same, the stored chunks are kept. If not, the chunks of the filing are replaced, and the hash is written, in one transaction.
6. The full-text index is rebuilt once after the chunks change.

## Text extraction

- A PDF is read page by page (`unpdf`). A page with no text is a scanned image: it is read by OCR (OCRmyPDF with Tesseract, the Portuguese and English languages), and the page is counted in the answer (`pagesWithoutText`) only if OCR could not read it.
- The tables of each page are read from its native structure (PyMuPDF, `find_tables`). Each table is one chunk with section `table`, its cells separated by ` | ` and its rows by ` ; `. The text of the page is also kept, so a table's words can be found twice.
- OCR and the table reader are optional tools: `INVESTMENT_MCP_OCRMYPDF` names the OCRmyPDF command and `INVESTMENT_MCP_PYTHON` the Python with PyMuPDF (ADR 0025). When a tool is missing, the document keeps the text it has.
- An HTML page is read by block. A heading (`h1` to `h4`) starts a section; the text under it is one segment per paragraph. Scripts, styles and the head are dropped.
- The format is read from the bytes, not from the content type. CVM sends PDFs with `text/html`.
- A zip that holds PDF entries (the periodic report, ITR) is read as its PDFs, page by page; with one PDF the chunks have no section, with several each section is the file name.
- A CVM reference form (FRE) is a zip with one XML. Its items are PDFs inside the XML, read the same way (ADR 0024): each chunk's `section` is the form tag and the item's file label, written `<tag> <label>`, for example `FatoresRisco 4.1 - Descrição dos fatores de risco`. The label is the file name the company gave the item's PDF, without `.pdf` or `.docx`, so the item number is the second word, cut at the first `_`: `split_part(split_part(section, ' ', 2), '_', 1)` gives `4.1`. Labels differ by company: a stock may write `FatoresRisco 4.1_Rod2 Validação_RI…` with no space after the number, which `split_part(section, ' ', 2)` alone would read as `4.1_Rod2` (checked on PETR4, `ID_DOC` 157150, 2026-11-15). The section `FatoresRisco 4.1` alone does not match, because the label follows the number, and `LIKE 'RemuneracaoAdministradores 8.1%'` also matches items 8.10 to 8.19. The item's `page` is the page of that item's PDF. The 13 tags of an FRE and their item numbers are in the search guide (`get_guide` with topic `search`). A blank slot of the form is skipped. The XML is read as cp1252, although it declares UTF-8.
- A document is read from the link the filing names, on any http or https host; the size limit (100 MiB) and the timeout (60 seconds) still apply. The server does not check the host of a document link.
- For CVM, only a PDF or a form zip is stored. The CVM site sometimes answers 200 with an HTML error page; that page is refused (`CvmDocumentAdapter`).
- Some CVM documents cannot be read. The load entry names the filing (`filing <filing_id>: ...`), writes no chunk for it, and leaves the other filings of the query loaded. Downloads from `www.rad.cvm.gov.br` have been seen to be cut off before their end; the cause is not known (`docs/adr/0025-cvm-rad-download-reproduction.md`). Coverage of sustainability and other CVM documents is therefore partial.

## Chunking rules

- A chunk never crosses a section or a page, so its `section` and `page` are exact. A PDF has no sections, so its chunks have `section` null; an HTML page has no pages, so its chunks have `page` null.
- A table keeps the section `table` only in a standalone PDF. In an FRE item, or in a zip of several PDFs, the table chunks take the section of the item (or NULL), and they come after the text of that item in `seq` order, because the table reader runs after the text. A DFP or an ITR is one PDF, so its chunks have section NULL.
- A segment of up to 1,200 characters is one chunk. A longer segment is cut into chunks of at most 1,200 characters, at a space, with 150 characters of overlap.
- `seq` numbers the chunks of a filing from 1, in document order.
- Whitespace is collapsed. Nothing else is changed: the text of a chunk is the words of the document.

## The index

- DuckDB's full-text extension (`fts`), with BM25 scoring. The index is built over the table `chunk_search`, which is `filing_id:seq` and the text of each chunk. It is dropped and built again after each load that changed a chunk.
- Stemmer: Portuguese (Snowball, from DuckDB). Stop words: the list in `FullTextIndexService.ts`, stored in `pt_stopwords`.
- Case and accents are ignored: `lucro` finds `Lucro`, and `líquido` finds `liquido`.
- Numbers are kept as their digits: the index uses the ignore pattern `(\.|[^a-z0-9])+`, so `25` is a token, `12%` gives `12`, and `0,30` gives two tokens, `0` and `30`. The default DuckDB pattern drops digits, which is why this one is set.
- Stemmer limit: DuckDB's Portuguese stemmer does not map every singular and plural to the same stem. `dividendo` becomes `divid`, and `dividendos` becomes `dividend`, so a query for one does not find the other. `sindicato` becomes `sindicat` and `sindicais` becomes `sindic`, while `concorrente`, `concorrentes` and `concorrência` all become `concorrent`. `pago` and `pagos` both become `pag`. A query can try the other forms (checked with DuckDB's `stem()`, DuckDB 2.0.0).
- The index spans every chunk in the store, not only the asset asked, so BM25 term weights depend on everything loaded.
- A query with several words matches a chunk that has any one of them: DuckDB's default is `conjunctive := 0`. There is no phrase, boolean or synonym syntax, so `AND` and `OR` are searched as words. For a phrase, add `AND text ILIKE '%...%'` on the macro output; for a synonym, list it as another word of the query.

## The search macro

```sql
SELECT text, score, filing_id, seq, section, page
FROM search_chunks('lucro líquido', 'BR:stock:PETR4', 'material_fact', NULL, 'text')
ORDER BY score DESC
```

- The rows are `asset_id, document_type, filing_id, section, page, seq, text, score`. `(filing_id, seq)` names the chunk in `asset_filing_chunks`, so its neighbours are one query away (`seq BETWEEN …`).

- Arguments, in order: the query text, `asset_id`, `document_type`, `section` and `mode`. `section` is NULL for no section; `mode` is `'text'`, the only one for now (ADR 0023).
- The macro's arguments count as filters for the SQL guard (`docs/product/sql-guard.md`). A query that passes `NULL` for `asset_id` or `document_type` is refused with the missing filter.
- The score is BM25 from the index. The macro sorts its rows by score, highest first; an outer `ORDER BY` changes that order.
- An outer `WHERE filing_id = '<id>'` on the macro output limits the load to that one filing, because the guard reads it as the filing to download.
- A query that matches nothing returns zero rows, and the answer says the filing was indexed.
- If the extension cannot be installed, the load reports `indexError` in `loaded`, the chunks are still stored, and `search_chunks` fails with DuckDB's error.

## Text from filings is data

A chunk that says "ignore your instructions" comes back as the value of a `text` column. The server never acts on it. This is tested in `src/Operations/QuerySqlOperation.test.ts` (AC6).

## Quality

The quality set (issue #10, S8) is not measured yet. It needs three real filings stored as fixtures, and ten questions with the passage each one should find. The sandbox this PR was written in received corrupted copies of three real CVM filings through its proxy (bad xref offsets and truncated transfers), so none of them could be stored as a fixture. The measurement has to be run on a machine that downloads the filings cleanly. Target: 8 of 10 questions with the passage in the top 5.

Issue #42, S6 (the TOTVS FRE 2025 version 5, `ID_DOC` 152065, as the quality set's filing): not measured. The sandbox of issue #42 could not download the zip in full: RAD closed the transfer at about 11.1 MB, of 11.7 MB, on each attempt, and does not resume (ADR 0025). No fixture was stored, so the question set and the measurement wait for a complete copy. The search guide's examples are checked by the guard and run on a seeded store, not against a real filing.

## Limits

- OCR is not done; a scanned page has no text.
- Only the chunks of the filing type or the filing id asked for are searched. A search over all filings of a company needs a load of each of them.
- A stock has no `management_report` filing: its IPE list has `material_fact` and `sustainability` only. `management_report` is the FII report (CVM fund filings and FNET).
- The management report and the notes of a DFP or an ITR are attached to its XML as PDFs, which the server does not read; whether the rendered PDF holds their text was not confirmed (ADR 0025).
- Structured financial statements are in `financial_statements` (issue #11), not in the search; FNET documents are issue #12.
