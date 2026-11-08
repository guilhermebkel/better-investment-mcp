# Sustainability reports: where they are, and the options for the owner to choose

Date: 2026-11-08. Status: proposed. The owner chooses the path; nothing here is built.

Issue #15 asks where the latest sustainability report of listed companies is published, whether a rule can find it, and which path to take. The owner decides the path, so this ADR ends with a proposal and no code.

## Where the reports are (10 companies)

The places below come from web search results (snippets and the file names in them). The agent did not open the pages, so each place is a lead to check, not a confirmed URL. The table also records the year each lead refers to, when the search gave it.

| Company (sector) | Where the lead points | Year seen | Host |
| --- | --- | --- | --- |
| Petrobras (energy) | sustentabilidade.petrobras.com.br, archive of past reports; a PDF on the mziq file manager | 2024 (a "Painel ASG 2024" PDF) | sustentabilidade.petrobras.com.br, api.mziq.com |
| Vale (mining) | No 2024 sustainability report found. The first financial report on sustainability (IFRS S1/S2) came out in June 2025; the 2024 management report is under vale.com/investidores | 2025 | vale.com |
| Itaú Unibanco (bank) | RI site: "Relatório ESG 2024" and the ESG index 2024; a PDF on the bank's download service | 2024 | itau.com.br |
| WEG (industry) | "Relatório Anual Integrado 2024" PDF on mziq; ri.weg.net lists annual reports | 2024 | ri.weg.net, api.mziq.com |
| Ambev (beverages) | ri.ambev.com.br, "relatórios anuais e sustentabilidade" (named in an academic article) | 2024 | ri.ambev.com.br |
| Lojas Renner (retail) | A PDF on the company's own site ("Relatorio-Anual-2024.pdf"); a climate financial report 2024 published in July 2025 | 2024 | lojasrennersa.com.br |
| Localiza (rental) | "Relatório de sustentabilidade 2024" PDF on mziq; a sustainability section on ri.localiza.com | 2024 | ri.localiza.com, api.mziq.com |
| Suzano (pulp) | centraldesustentabilidade.suzano.com.br (executive summary PDF); suzano.com.br reports page | 2024 | centraldesustentabilidade.suzano.com.br |
| Axia Energia, formerly Eletrobras (utilities) | axia.com.br/documents (the 2024 annual report, third edition); a copy on eletrobras.com | 2024 | axia.com.br, eletrobras.com |
| Totvs (software) | "Relato Integrado 2024" in the sustainability section of ri.totvs.com; PDFs on mziq | 2024 | ri.totvs.com, api.mziq.com |

What the table shows:

- No single rule finds all ten. The reports sit on at least eight hosts: the company's own site or RI site, or a file manager (mziq) used by five of them.
- Several companies publish one document as an "integrated report" or a "financial report on sustainability". The search did not separate them, so a rule that matches a name would also match the wrong document.
- The year changes the file name and the page, so any rule breaks each year.

## Is there a CVM route?

The CVM open data (IPE, `ipe_cia_aberta_2025.zip`) has no category named "Relatório de Sustentabilidade". The category the adapter maps to `sustainability` does not occur in the 2025 file. The file does carry the report as a communication: in 2025 at least 11 rows have a subject that names a sustainability report (for example "Relatório de Sustentabilidade 2024"), under the category "Outros Comunicados Não Considerados Fatos Relevantes". Those rows link to the CVM document. The count is a minimum, from the ten most frequent subjects. The coverage is partial: a company that did not file the report as a communication has no row. Vale's source says its financial report on sustainability follows the CVM rule (Resolução CVM 193/23) and was published early, voluntarily; the schedule of that rule was not checked.

## Options

- **(a) A source and an adapter: the CVM IPE communications whose subject names a sustainability report.** Official, the same host and format as the IPE adapter (#9), with a link from CVM. Partial coverage; the match is on the subject text, which can change. The adapter's current category mapping should be changed too.
- **(b) A rule that takes the URL from the company's IR page.** Ten different sites, six or so layouts, and a new check each year. The terms of each site are not read.
- **(c) The user gives the URL and the server indexes it.** The owner or the agent gives a company and a document URL; the server downloads that document from its host and indexes the text with the pipeline of #10. No crawling and no rule to maintain. It needs the host to be allowed for that one request, which the adapter's fixed host list does not do today.
- **(d) Not supported yet.** The ADR records it and the feature is left out. The agent answers that these reports are not available.

## Recommendation

Build (a) first: it is official, cheap, and covers the companies that file the report as a communication. For the rest, (c) gives full coverage for the owner's chosen companies without a rule per site. Do not build (b) until the site terms are read, because the maintenance cost is ten rules a year. The recommendation depends on the owner's decision on the coverage and on the terms.

## Consequences

- No code in this change. Issue #15 stays open, with `needs-info`, until the owner chooses a path (AC3). The owner's choice then becomes new issues in the task format.
- The AC1 list above is from search snippets. Opening each lead, and checking that the 2024 document is the final version, is the next step if the owner wants (b) or (c).
