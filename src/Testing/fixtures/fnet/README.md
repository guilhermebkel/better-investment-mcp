# FNET Test Fixtures & Provenance

## Collection Date
- **Artifacts Collection Date**: `2026-11-08` (retrieved during Phase 1 & 2 research spike session; exact original collection time is unknown).
- **Filing Dates**:
  - HGLG11 (doc `1348097`): `dataEntrega`: `13/10/2026 19:23`; `dataReferencia`: `30/09/2026`.
  - KNRI11 (doc `1368920`): `dataEntrega`: `04/11/2026 18:12`; `dataReferencia`: `30/10/2026`.

## Listing Fixture (`fnet-search-response.json`)
- **Query Endpoint**: `https://fnet.bmfbovespa.com.br/fnet/publico/pesquisarGerenciadorDocumentosDados?d=1&s=5&l=5&tipoFundo=1&cnpjFundo=11728688000147&o[0][dataEntrega]=desc`.
- **Target Asset**: HGLG11 (CNPJ `11.728.688/0001-47`), Pátria Log FII.
- **Record Provenance**:
  - **Confirmed Real Record**: Document `1348097` (Relatório Gerencial de `13/10/2026 19:23`) is the single confirmed real record saved in `.vc2/spike-fnet/HGLG11.json`.
  - **Synthetic Test Records**: Documents `1352825`, `1352822`, `1352479`, and `1342659` are synthetic test variants created to verify that non-managerial document categories (Aviso aos Cotistas, Deliberação, Informe Mensal, Fato Relevante) are strictly filtered out by `FnetAdapter`.
- **Totals**: `recordsTotal: 5`, `recordsFiltered: 5` (adjusted to match the 5-item test slice).

## Extracted Pages (`unpdf`)
Extracted directly using `DocumentTextService` (`unpdf`) during Phase 1 & 2 research spikes on `2026-11-08`. Note: PDF text extraction flattens 2D visual tables into linear text streams.

1. **`hglg11-doc-1348097-page5-excerpt.txt`**:
   - **Document**: HGLG11 Relatório Gerencial (Setembro/2026), ID `1348097`.
   - **URL**: `https://fnet.bmfbovespa.com.br/fnet/publico/exibirDocumento?id=1348097&cvm=true`
   - **Page**: Complete extracted page 5.
   - **Contents**: Financial metrics (`Patrimônio Líquido R$ 7,5 bilhões`, `Cota Patrimonial R$ 165,48`, `P/VP 0,89x`, `Dividend Yield 9,5% a.a.`), monthly result guidance (`R$ 1,17/cota`), tenant movements.

2. **`knri11-doc-1368920-page1-excerpt.txt`**:
   - **Document**: KNRI11 Relatório Gerencial (Outubro/2026), ID `1368920`.
   - **URL**: `https://fnet.bmfbovespa.com.br/fnet/publico/exibirDocumento?id=1368920&cvm=true`
   - **Page**: Complete extracted page 1.
   - **Contents**: Fund summary (`Patrimônio Líquido R$ 4.602.278.866,50`, `Vacância Física 1,93%`, `Vacância Financeira 4,83%`, `Distribuição Mensal R$ 1,10/cota`, `Cota Mercado R$ 150,50`).
