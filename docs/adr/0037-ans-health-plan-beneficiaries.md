# ANS: health plan beneficiaries per operator (stopped at the ADR)

Date: 2026-11-15.

Status: stopped. No adapter is written. The source is `excluded` in `scripts/source-coverage.json` with this reason (issue #59, phase 2d).

## What was checked on 2026-11-15

- The data portal `https://dadosabertos.ans.gov.br/` answers HTTP 200. Its root has no terms text. The candidate pages `termos-de-uso` and `termos` answer 404, and so do the candidate gov.br pages for the ANS terms and open data. **No terms page was found, so no terms are quoted.** The issue stops the phase when no page with the terms can be read.
- The data are in `FTP/PDA/informacoes_consolidadas_de_beneficiarios-024/<YYYYMM>/`, one zip per state (27 files) per month. The file `pda-024-icb-SP-2026_01.zip` is 144,508,391 bytes zipped, and its CSV has the columns `ID_CMPT_MOVEL`, `CD_OPERADORA`, `NM_RAZAO_SOCIAL`, `NR_CNPJ`, `MODALIDADE_OPERADORA`, `SG_UF`, `CD_MUNICIPIO`, `TP_SEXO`, `DE_FAIXA_ETARIA`, `CD_PLANO`, `TP_VIGENCIA_PLANO`, `DE_CONTRATACAO_PLANO`, `DE_SEGMENTACAO_PLANO`, `DE_ABRG_GEOGRAFICA_PLANO`, `COBERTURA_ASSIST_PLAN`, `TIPO_VINCULO`, `QT_BENEFICIARIO_ATIVO`. The operator's CNPJ is in `NR_CNPJ`.
- Over 1 GB a month is downloaded for one month of the whole country. This is the same size reason the owner used to reject the Receita Federal CNPJ files (D2 of issue #59, ADR 0032).
- The operator registry `operadoras_de_plano_de_saude_ativas/Relatorio_cadop.csv` (345,269 bytes) maps `REGISTRO_OPERADORA` to `CNPJ`, so the rule S15 of issue #59 has its mapping file.

## Next step

The owner decides whether a load of 27 state files a month is accepted, or whether the phase is built for a single state and a single period. The terms page must be found and quoted in this ADR first.
