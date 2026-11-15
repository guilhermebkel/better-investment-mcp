# BCB IF.data: the size and the share of a listed bank

Date: 2026-11-15.

Status: accepted for the source of issue #59, phase 2a. Built for two measures of a listed bank.

## The terms, as read

- The BCB terms of use page (`https://www.bcb.gov.br/acessoinformacao/termosdeuso`) is rendered by JavaScript and its text could not be read from the server on 2026-11-15, so no sentence of it is quoted.
- The BCB open data catalogue (`https://dadosabertos.bcb.gov.br/api/3/action/package_search?q=ifdata`) gives the licence of the dataset "IFData - Dados selecionados de instituições financeiras" as **Open Data Commons Open Database License (ODbL)**. Its description says the data are the IFData reports of `https://www3.bcb.gov.br/ifdata/` in open data format, and that the source databases are SCR and Cosif.
- The ODbL requires attribution and, for a database derived from it, share-alike. The attribution given in the sources guide is "Banco Central do Brasil, IFData". The share-alike duty is a point for the owner: the server stores shares and sums computed from the data, which are derived values. The owner decides whether that is accepted for the open source package.
- No clause of the ODbL forbids automated use.

## The service

- Route: `https://olinda.bcb.gov.br/olinda/servico/IFDATA/versao/v1/odata`. Three function imports: `IfDataCadastro(AnoMes)` (the institutions, with `CodInst` and `CnpjInstituicaoLider`, the 8-digit CNPJ root of the group's leader), `IfDataValores(AnoMes, TipoInstituicao, Relatorio)` (the accounts, `Conta`, `NomeColuna` and `Saldo`) and `ListaDeRelatorio()` (16 reports).
- Checked on 2026-11-15, month 2025-09: `IfDataValores` with `TipoInstituicao=1` (prudential conglomerates and independent institutions) and `Relatorio='2'` (Ativo) answers 1,375 institutions. `Saldo` is in reais (the description says "Valores monetários em R$"). The largest group's total assets are about R$ 2.65 trillion.
- `$filter=Conta eq '140220'` reduces the answer from about 14.6 MB to about 0.4 MB, so the adapter asks for one account at a time.
- Accounts used: `140220` Ativo Total (total assets) and `140205` Operações de Crédito (the credit portfolio). Both are in report 2.
- Periods: only quarter ends (`03`, `06`, `09`, `12`) are published. The first served quarter is 2013-03.

## Decision

- The category `banking`, provider `BR:bcb`, setting `INVESTMENT_MCP_BANKING_PROVIDER`. The asset is a listed stock; the rows are in `asset_metrics`.
- The link is made by the CNPJ root: a stock is linked to a group when its CNPJ has the 8-digit root of the group's `CnpjInstituicaoLider`. No match by name, no curated list (rule S15 of issue #59). A stock with no bank in the file has no row.
- Metrics per quarter, dated with the quarter (`reference_time_start` is the first day of the quarter, `reference_time_end` its last day):
  - `banking.total_assets` (unit `brl`) and `banking.credit_portfolio` (unit `brl`): the group's value.
  - `banking.total_assets_share` and `banking.credit_portfolio_share` (unit `percent`): the group's value over the sum of the same account over every row of the same file and quarter (rule S16).
- A quarter with no published institution registry is named in the load's item errors and stores no row. A load fails when the request fails or the answer does not have the shape the schema reads.
- Deposits (report `Passivo`) are not built in this phase: two measures were chosen, which give the size of a bank and its lending.
