# Filing search stays full text, with variants written by the agent

Date: 2026-11-15.

Status: accepted by the owner on 2026-11-15 (issue #61, decisions D1, D2 and D3). Measure again before any change listed under "When to measure again".

## Decisions

- **D1. No semantic or hybrid mode.** Full text only. With keywords and their variants, full text already found a relevant chunk in the top 5 for 30 of 30 investor questions (MRR@10 0.846). ADR 0023 measured e5-large at 0.610 against 0.598 for full text, at about ten minutes of CPU per FRE (estimated from 202 s for 265 chunks), so an embedding mode does not pay for itself now.
- **D2. No synonym list in the server.** The guide gets a table of Portuguese finance variants, as examples the agent sends together. The server never expands a query. A list of 11 groups lowered the score when added to the guide's keywords (0.846 to 0.815) and helped only when the agent sent the full question (0.545 to 0.627).
- **D3. No all-words mode (`text_all`), and no change to `conjunctive`.** Any word matches. All words with the variants of the guide returned zero chunks for 22 of 30 queries. A phrase is required by an `ILIKE` filter on the output of the macro, which narrows the output as well and had the best score (0.851).

## The baseline

Five FREs of reference year 2026 (TOTS3, WEGE3, PETR4, ITUB4, MGLU3), loaded through the server's own load path on 2026-11-15, with no OCRmyPDF and no PyMuPDF on the measuring machine. Thirty questions, six per stock, written in Portuguese as an investor asks them. The query of each mode was fixed before the search.

| How the query was written | Hits in top 5 | Hits in top 10 | MRR@10 | Median chunks matched | Queries with zero results |
| --- | --- | --- | --- | --- | --- |
| (a) Any word, keywords and variants (today's guide) | 30/30 | 30/30 | 0.846 | 165 | 0 |
| (c) (a) plus an `ILIKE` phrase filter on the output | 30/30 | 30/30 | 0.851 | 8 | 0 |
| (d) Any word, the full question as the query | 19/30 | 23/30 | 0.545 | 505.5 | 0 |
| (e1) (d) plus a server-side synonym list | 22/30 | 27/30 | 0.627 | 550 | 0 |
| (e2) (a) plus a server-side synonym list | 29/30 | 30/30 | 0.815 | 190 | 0 |
| (b1) All words, same query as (a) | 4/30 | 4/30 | 0.133 | 0 | 22 |
| (b2) All words, a short query of 2 or 3 core words | 29/30 | 30/30 | 0.798 | 3.5 | 0 |
| (b3) Any word, the same short query as (b2) | 29/30 | 30/30 | 0.776 | 95 | 0 |
| (b4) All words, the full question as the query | 3/30 | 3/30 | 0.100 | 0 | 26 |

## Limits of the measurement

- Five forms, all of reference year 2026.
- One person wrote the questions and judged the relevant chunks. Relevance was first judged by reading the forms before any search (with only that, (a) is 28/30 in the top 5 with MRR@10 0.696, (c) 27/30 with 0.693, (d) 14/30 with 0.348). After the first run, the top 3 of modes (a), (b2) and (d) were read and 26 more relevant chunks were added to 17 questions, which favours those modes.
- The BM25 statistics come from the five forms together, so ranks change with another set of loaded filings.
- No OCR and no table reader were installed on the measuring machine, so the chunks are the text pages only.

The committed set and the command that reproduces the table are in `scripts/search-quality/questions.json` and `pnpm search:quality` (`docs/product/search.md`, "Quality").

## When to measure again

- Before any new search mode, including `text_all` and a semantic one.
- Before any server-side change to a query, including a synonym list.
- Before any change to chunking (size or overlap), or to the item rule of ADR 0043.
