# GDELT DOC 2.0: news by term

Date: 2026-11-15.

Status: accepted for the source of issue #59, phase 3. Built.

## The terms, as read

Read on 2026-11-15 at `https://www.gdeltproject.org/about.html` (Terms of Use):

- "The GDELT Project is an open platform for research and analysis of global society and thus all datasets released by the GDELT Project are available for unlimited and unrestricted use for any academic, commercial, or governmental use of any kind without fee."
- "However, any use or redistribution of the data must include a citation to the GDELT Project and a link to this website (https://www.gdeltproject.org)."

No clause forbids automated use. The attribution the server gives is "GDELT Project, https://www.gdeltproject.org" in the sources guide.

## The API

- Route: `https://api.gdeltproject.org/api/v2/doc/doc` with `mode=artlist&format=json&maxrecords=250&startdatetime=YYYYMMDDHHMMSS&enddatetime=YYYYMMDDHHMMSS`.
- The API searches a rolling window of the last 3 months, as the GDELT blog post on the DOC 2.0 API says (`https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/`).
- GDELT limits the server to one request every five seconds; a 429 answer fails the load with that reason, and nothing is written.
- Checked on 2026-11-15: every request for the term `petrobras` answered 429 from this server, the first one included, so no real article was read. The adapter's tests use recorded answers of the documented shape; the first load on the server must be checked against the live API.

## Decision

- The category `news`, provider `BR:gdelt`, setting `INVESTMENT_MCP_NEWS_PROVIDER`, timeout 60 s (the observed answer took 16 s).
- The asset `BR:news:<TERM>` is a search. `_` stands for a space; a term with a space is sent as a quoted phrase. The server adds no other operator and no language or country filter.
- Table `asset_news`, one row per article. The key is `(asset_id, url)`. The period column is `published_time` (GDELT's `seendate`, as a UTC time). The other columns are `title`, `domain`, `language` and `source_country`.
- A period that ends before the last 3 months fails with the window named. A period that starts before it is answered for the part inside the window, and the load names the rows it cannot answer. An empty answer is zero rows, not an error.
- The noise of a term that matches other companies is accepted (the owner's decision, D3 and S26).
