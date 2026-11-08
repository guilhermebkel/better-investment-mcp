# FNET Test Fixtures & Provenance

## Listing Fixture (`fnet-search-response.json`)
- **Origin**: Public FNET query endpoint `https://fnet.bmfbovespa.com.br/fnet/publico/pesquisarGerenciadorDocumentosDados?d=1&s=5&l=5&tipoFundo=1&cnpjFundo=11728688000147&o[0][dataEntrega]=desc`.
- **Target Asset**: HGLG11 (CNPJ `11.728.688/0001-47`), Pátria Log FII.
- **Slice**: 5 real records from offset 5, containing 1 managerial report (`id: 1348097`, delivered on `13/10/2026 19:23`) and 4 other document categories (Aviso aos Cotistas, Deliberação, Informe Mensal, Fato Relevante).
- **Totals**: `recordsTotal: 5`, `recordsFiltered: 5` (sized to match the fixture slice).

## Real Text Excerpts
Extracted directly using `DocumentTextService` (`unpdf`) during Phase 1 & 2 research spikes. Note: PDF extraction flattens 2D visual tables into linear text streams.

1. **`hglg11-doc-1348097-page5-excerpt.txt`**:
   - **Document**: HGLG11 Relatório Gerencial (Setembro/2026), ID `1348097`.
   - **URL**: `https://fnet.bmfbovespa.com.br/fnet/publico/exibirDocumento?id=1348097&cvm=true`
   - **Page**: 5.
   - **Contents**: Financial metrics (`Patrimônio Líquido R$ 7,5 bilhões`, `Cota Patrimonial R$ 165,48`, `P/VP 0,89x`, `Dividend Yield 9,5% a.a.`), monthly result guidance (`R$ 1,17/cota`), tenant movements.

2. **`knri11-doc-1368920-page1-excerpt.txt`**:
   - **Document**: KNRI11 Relatório Gerencial (Outubro/2026), ID `1368920`.
   - **URL**: `https://fnet.bmfbovespa.com.br/fnet/publico/exibirDocumento?id=1368920&cvm=true`
   - **Page**: 1.
   - **Contents**: Fund summary (`Patrimônio Líquido R$ 4.602.278.866,50`, `Vacância Física 1,93%`, `Vacância Financeira 4,83%`, `Distribuição Mensal R$ 1,10/cota`, `Cota Mercado R$ 150,50`).
