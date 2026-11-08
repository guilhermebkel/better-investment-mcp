export type FnetFilingKind = "fii_management_report";

export type FnetDocumentItem = {
  id: number;
  versao: number;
  tipoDocumento?: string | null;
  categoriaDocumento?: string | null;
  dataEntrega?: string | null;
  dataReferencia?: string | null;
  descricaoFundo?: string | null;
  descricaoModalidade?: string | null;
  descricaoStatus?: string | null;
};

export type FnetSearchResponse = {
  data: FnetDocumentItem[];
  recordsTotal: number;
  recordsFiltered?: number;
};
