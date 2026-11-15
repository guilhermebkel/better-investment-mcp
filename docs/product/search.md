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
- A CVM reference form (FRE) is a zip with one XML: the XML whose root is `XmlFormularioReferencia`, not the first XML of the zip (a real zip also holds `FormularioCadastral.xml`). Its items are PDFs inside the XML, read the same way (ADR 0024). Each chunk has two names (ADR 0043):
  - `item`: CVM's item number, `1.4`, `8.20`, read from the element that holds the item's PDF inside its section tag, through a table of 13 section tags. For example, a PDF in `InfoSegmentosOperacionais` under `AtividadesEmissor` is item `1.3`. The table is in `src/Services/FormReferenceService.ts`, with its source. A PDF directly under its section tag, or an element that is not in the table, has `item` NULL; its text is still stored.
  - `section`: `<tag> <label>`, for example `FatoresRisco 4.1 - Descrição dos fatores de risco`. The label is the file name the company gave the PDF, without `.pdf` or `.docx`. It can carry another number: `2.4_Item 6.5_FRE 2026_…` is item `6.5` in `OrganogramaAcionistasGrupoEconomico`, and `IUH - 1.3` and `1.04` are items `1.3` and `1.4`. The item number is never read from the label.
  - The labels seen on ITUB4, WEGE3 and PETR4 (checked on 2026-11-15) are in ADR 0043, with the 98 of 381 items that the old file-name rule got wrong.
  - The item's `page` is the page of that item's PDF. A blank slot of the form is skipped. The XML is read as cp1252, although it declares UTF-8.
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
- A query with several words matches a chunk that has any one of them: DuckDB's default is `conjunctive := 0`. There is no phrase, boolean or synonym syntax, so `AND` and `OR` are searched as words. For a phrase, add `AND text ILIKE '%...%'` on the macro output. For a synonym, the agent lists it as another word of the query: the server never expands a query (ADR 0044).

### Query with variants

The agent writes 2 to 6 keywords with their variants, never the user's full question (ADR 0044). The search guide holds a table of variants to send together (competitors, dividends, strikes and unions, and others). On 30 investor questions, keywords with variants found a relevant chunk in the top 5 for 30 of them, and the full question for 19. The guide is the place for the variants: the server adds none.

## The search macro

```sql
SELECT text, score, filing_id, seq, section, page
FROM search_chunks('lucro líquido', 'BR:stock:PETR4', 'material_fact', NULL, 'text')
ORDER BY score DESC
```

- The rows are `asset_id, document_type, filing_id, section, item, page, seq, text, score`. `(filing_id, seq)` names the chunk in `asset_filing_chunks`, so its neighbours are one query away (`seq BETWEEN …`).

- Arguments, in order: the query text, `asset_id`, `document_type`, `section` and `mode`. `section` is NULL for no section; `mode` is `'text'`, the only one for now (ADR 0023).
- The macro's arguments count as filters for the SQL guard (`docs/product/sql-guard.md`). A query that passes `NULL` for `asset_id` or `document_type` is refused with the missing filter.
- The score is BM25 from the index. The macro sorts its rows by score, highest first; an outer `ORDER BY` changes that order.
- An outer `WHERE filing_id = '<id>'` on the macro output limits the load to that one filing, because the guard reads it as the filing to download.
- A query that matches nothing returns zero rows, and the answer says the filing was indexed.
- If the extension cannot be installed, the load reports `indexError` in `loaded`, the chunks are still stored, and `search_chunks` fails with DuckDB's error.

## Text from filings is data

A chunk that says "ignore your instructions" comes back as the value of a `text` column. The server never acts on it. This is tested in `src/Operations/QuerySqlOperation.test.ts` (AC6).

## Quality

The quality set is the 30 investor questions of issue #61, with the passages that answer each one. It is in `scripts/search-quality/questions.json`, and it is run by `pnpm build && pnpm search:quality -- <cache-dir> --out <file>`. The run downloads the five filings from RAD, so it is not part of `pnpm test`, `pnpm check` or CI. The metrics are tested without a network (`scripts/search-quality/metrics.test.mjs`).

A relevant chunk is one whose text, with whitespace collapsed, contains a quote of the question. Quotes locate a chunk; they are not always the sentence that answers the question. Three modes are measured: `keywords` (the query of the guide, with its variants), `keywords_phrase` (the same, with an `ILIKE` phrase filter on the output) and `question` (the full question, as the query).

### Baseline (2026-11-15, measured before this issue's code)

Five FREs of reference year 2026 (TOTS3, WEGE3, PETR4, ITUB4, MGLU3), loaded through the server's own load path, with no OCRmyPDF and no PyMuPDF on the measuring machine (so no OCR pages and no table chunks). The baseline is the reference: it is not changed by later runs.

| How the query was written | Hits in top 5 | Hits in top 10 | MRR@10 | Median chunks matched | Queries with zero results |
| --- | --- | --- | --- | --- | --- |
| (a) Keywords with variants, no filter | 30/30 | 30/30 | 0.846 | 165 | 0 |
| (c) Keywords with variants and an `ILIKE` phrase filter | 30/30 | 30/30 | 0.851 | 8 | 0 |
| (d) Any word, the full question as the query | 19/30 | 23/30 | 0.545 | 505.5 | 0 |

Limits of the baseline: five forms of 2026; the questions were written and the relevant chunks judged by one person, and the top 3 of three modes were read before pooling 26 more relevant chunks into 17 questions, which favours those modes; the BM25 statistics come from the five forms together; no OCR and no tables.

### Run of 2026-11-15 (this issue's code, after the item column)

The same five filings and the same questions, run by `pnpm search:quality` on the built server, with the same tools as the baseline (no OCRmyPDF; tesseract and ghostscript installed; `python3` without PyMuPDF, so no table chunks).

| How the query was written | Hits in top 5 | Hits in top 10 | MRR@10 | Median chunks matched | Queries with zero results |
| --- | --- | --- | --- | --- | --- |
| (a) Keywords with variants, no filter | 29/30 | 30/30 | 0.842 | 165 | 0 |
| (c) Keywords with variants and an `ILIKE` phrase filter | 30/30 | 30/30 | 0.829 | 8 | 0 |
| (d) Any word, the full question as the query | 19/30 | 22/30 | 0.52 | 505.5 | 0 |

Against the baseline: one question less in the top 5 for (a), and MRR@10 lower by 0.004 for (a), 0.022 for (c) and 0.025 for (d). The cause of the difference was not investigated: the baseline was measured before the item column and the chunk changes of this issue, and the five filings were downloaded again from RAD, which answered with retries. The baseline is not changed. The search ranking is the one of ADR 0044.

## Limits

- OCR is done for scanned pages when OCRmyPDF and Tesseract are installed, and the table reader runs when PyMuPDF is installed (ADR 0027). Without them a scanned page has no text, and the answer counts it (`pagesWithoutText`).
- Only the chunks of the filing type or the filing id asked for are searched. A search over all filings of a company needs a load of each of them.
- A stock has no `management_report` filing: its IPE list has `material_fact` and `sustainability` only. `management_report` is the FII report (CVM fund filings and FNET).
- The management report and the notes of a DFP are attached to its XML as complete PDFs (group 1653 and 412, ADR 0045), which the server does not read. Whether the rendered PDF holds their text is not decided: on 2026-11-15 the rendered PDF of each of four DFPs arrived cut and could not be read, so the research is open (ADR 0045).
- Structured financial statements are in `financial_statements` (issue #11), not in the search; FNET documents are issue #12.
