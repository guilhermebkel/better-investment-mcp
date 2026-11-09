# One search macro, with a mode

Date: 2026-11-09.

Searching the text of filings is one `search_chunks` macro that takes the words of the query, the filters and a section. The team may later add semantic search (embeddings) and hybrid search (both combined). Each would be a different way to rank the same chunks, and the query written by the AI should not change shape when one is added.

## Decision

- `search_chunks` takes five arguments: the query text, `asset_id`, `document_type`, `section` (NULL for no section) and `mode`.
- The only mode now is `'text'`: the BM25 full-text index with Portuguese stemming, as before. The guard lists the modes it accepts; any other mode is refused by name, before the query runs.
- Semantic and hybrid modes are added later, as new values of `mode`, without changing the arguments. Each needs a decision of its own, with its evidence.
- The macro returns no rows for a mode it does not know, so a mode the guard did not refuse cannot return text results by mistake.

## Evidence for not adding embeddings yet

A test with 16 questions over 8 native documents (265 chunks of 800 characters, overlap 200), where the expected passage is the one that contains a phrase of the document:

| Method | Hits in the top 5 | MRR@10 |
| --- | --- | --- |
| Full text (DuckDB, Portuguese stemmer) | 13/16 | 0.598 |
| paraphrase-multilingual-MiniLM-L12-v2 | 8/16 | 0.381 |
| paraphrase-multilingual-mpnet-base-v2 | 8/16 | 0.312 |
| multilingual-e5-large | 13/16 | 0.610 |
| Full text and e5-large combined (RRF) | 13/16 | 0.634 |

The question set was written by hand and its phrases were copied from the text, which favours the full text. The e5-large model took 202 seconds for 265 chunks on the CPU of the server. The next evaluation should use questions written as a user would ask them.

## Consequences

- A query that calls `search_chunks` with four arguments is refused, with the five-argument form in the message.
- The guide, the SQL guard documentation and the integration tests use the five-argument form.
- A future semantic mode needs: an embeddings table per model, the query vector written by the server in a one-row table before the query runs (the macro reads it), and the mode added to the guard's list.
