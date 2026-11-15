export const FRE_GUIDE = `# FRE guide

An FRE (reference form) is a filing with one PDF per item. Each chunk of an item has two names:

- \`item\`: CVM's item number, written as CVM writes it (\`1.4\`, \`8.20\`). It comes from the element of CVM's form that holds the PDF, so use it to find an item: \`item = '8.1'\` gives item 8.1 only.
- \`section\`: \`<tag> <label>\`, for example \`FatoresRisco 4.1 - Descrição dos fatores de risco\`. The label is the company's file name (\`IUH - 1.3\`, \`1.04\`, \`Presidente assinada em …\`). It can carry another number, so do not read the item from it.

\`item\` is NULL for a PDF that is not in CVM's table, or that sits directly under its section tag. Its text is still searchable, by section.

## Section tags and item numbers

- AtividadesEmissor: 1.1 to 1.16
- ComentariosDiretores: 2.1 to 2.11
- Projecoes: 3.1 to 3.2
- FatoresRisco: 4.1 to 4.7
- PoliticaGerenciamentoRiscosEControleInterno: 5.1 to 5.5
- ControleGrupoEconomico: 6.5 to 6.6
- AssembleiaGeralEAdm: 7.1 to 7.8
- RemuneracaoAdministradores: 8.1 to 8.20
- Auditores: 9.3 to 9.4
- RecursosHumanos: 10.1 to 10.5
- TransacoesPartesRelacionadas: 11.1 to 11.3
- CapitalSocialValoresMobiliarios: 12.2 to 12.9
- ResponsaveisFormulario: 13.1 to 13.2

## Examples

One FRE item, in page order (item 4.1 is the risk factors):
\`\`\`sql
SELECT section, page, seq, text FROM asset_filing_chunks WHERE asset_id = 'BR:stock:PETR4' AND filing_id = 'fre-1' AND item = '4.1' ORDER BY page, seq
\`\`\`

Sections of one filing, in document order:
\`\`\`sql
SELECT section, min(seq) AS first_seq FROM asset_filing_chunks WHERE asset_id = 'BR:stock:PETR4' AND filing_id = 'fre-1' GROUP BY section ORDER BY min(seq)
\`\`\`

FRE filings of a company, newest reference year first, to pick a filing_id:
\`\`\`sql
SELECT filing_id, reference_time_start, published_at, version FROM asset_filings WHERE asset_id = 'BR:stock:PETR4' AND document_type = 'fre' ORDER BY reference_time_start DESC
\`\`\`

Wrong, do not write it: \`section = 'FatoresRisco 4.1'\` matches no chunk, because the label follows the number; and \`item LIKE '8.1%'\` also matches items 8.10 to 8.19. Use \`item = '8.1'\`.

## See also

- search: the search rules and the query with variants.
- sources: which provider serves the filings.
`;
