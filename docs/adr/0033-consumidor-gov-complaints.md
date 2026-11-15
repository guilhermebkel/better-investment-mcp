# Consumidor.gov.br complaints by trade name

Date: 2026-11-15.

Status: accepted for the source of issue #59, phase 1. The terms were read on the source's own page on 2026-11-15.

## The terms, as read on the source's own page

Read on 2026-11-15 at `https://www.consumidor.gov.br/pages/conteudo/publico/7` (Termos de Uso), the page linked from `https://www.consumidor.gov.br/pages/dadosabertos/externo/` (Dados Abertos):

- "Observação: a realização de consultas a relatórios e estatísticas divulgados pelo site é aberta a qualquer pessoa, independentemente da finalidade do uso da informação, não sendo necessário o cadastramento como usuário."
- "Informação pública: informações não individualizadas e nem sigilosas, cuja divulgação seja possibilitada por meio do site (relato da reclamação, resposta do fornecedor, comentário final do consumidor e informações estatísticas, tais como, faixa etária dos consumidores, área, assunto, problema relacionados à demanda, etc)."
- Section 5 (vedações ao usuário) lists the prohibitions: false information, false identities, use for purposes other than the site's, intellectual property in attachments, personal data in public fields, and changes that hinder a complaint. It does not prohibit the automated retrieval of the published statistics.

The page does not state a licence. The licence CC BY given in issue #59 comes from secondary sources and the dados.gov.br catalogue summary, which the server did not read in full (that page needs JavaScript). The attribution to Consumidor.gov.br is given in the sources guide.

The monthly files carry the consumer's region, city, sex and age range, which the terms allow only in a non-individual form for statistics. The adapter reads the columns of the table below and no other, so none of those personal-profile columns is stored.

## The files

- The list of published files is `https://www.consumidor.gov.br/pages/publicacao/externo/publicacoes.json?indicadorTipoPublicacao=2` (latin-1). Each entry has `nomeArquivo` (`finalizadas_YYYY-MM.zip` for the complaints finished in the month), `codigo` and `tamanhoArquivo`. The list can answer slowly or with a gateway timeout; the HTTP adapter retries it.
- A monthly file is `https://www.consumidor.gov.br/pages/publicacao/externo/<codigo>/download`. It is a zip with one CSV, `finalizadas_YYYY-MM.csv`, separated by `;`, UTF-8 with a byte order mark.
- Checked on 2026-11-15 with `finalizadas_2026-10.zip`: 15,692,004 bytes zipped, 141,132,660 bytes in the CSV. The columns are `regiao`, `uf`, `cidade`, `sexo`, `faixa_etaria`, `data_finalizacao`, `tempo_resposta`, `nome_fantasia`, `segmento_de_mercado`, `area`, `assunto`, `grupo_problema`, `problema`, `como_comprou_contratou`, `procurou_empresa`, `respondida`, `situacao`, `avaliacao_reclamacao`, `nota_do_consumidor`.
- Coverage starts with `finalizadas_2021-08.zip`. Older files have irregular names and are not read.

## Decision

- Asset `BR:complaints:<TERM>` is a search. `_` in the code stands for a space. A trade name (`nome_fantasia`) matches when its normalized form contains the normalized term, where normalization removes the accents, uppercases, turns every character outside `A-Z` and `0-9` into a space and collapses the spaces. There is no fuzzy match, no synonym list and no ticker list.
- Table `asset_complaints`, one row per asset, trade name and month. The key is `(asset_id, trade_name, reference_time_start)`. Columns: `complaint_count`, `answered` (`respondida` = `Sim`), `rated` (`situacao` = `Finalizada avaliada`), `resolved` (`avaliacao_reclamacao` = `Resolvida`), `score_mean` (the mean of `nota_do_consumidor` over the rows that have a note; null when none), `response_days_mean` (the mean of `tempo_resposta`; null when none).
- A load reads the months of the requested period from `2021-08` on. A load without a period reads the latest published month. A period that starts before `2021-08` fails with a message that names `2021-08`. A month of the period that has no file, before the latest published month, fails the load with the month in the message. A month after the latest published file is not published yet: it is named in the load's item errors and stores no row, because a default period runs to the end of the year.
- Any HTTP error, timeout or damaged zip fails the load, names the vendor and the file, and writes nothing.
- The trade name is stored as the file writes it. One company has several trade names, and a term can match another company: `PETROBRAS` matches `Postos Petrobras (Vibra Energia)`. The sources guide says so.
