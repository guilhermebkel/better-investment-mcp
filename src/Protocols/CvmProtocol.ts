export type LegalIdLookup = (market: string, ticker: string) => Promise<string | undefined>;

import type { ProviderRow } from "@/Protocols/ProviderProtocol.ts";

export type CvmPeriodicKind = "itr" | "dfp" | "fre";

export type CvmFilingKind = CvmPeriodicKind | "sustainability" | "material_fact" | "other";

export type CvmKey = {
  market: string;
  ticker: string;
  asset_type: string;
};

export type KnownCvmCategory = "Fato Relevante" | "Relatório de Sustentabilidade";

export type CvmStatementCode = "DRE" | "BPA" | "BPP" | "DFC_MD";

export type CvmStatementVersion = "con" | "ind";

export type CvmStatementEntry = {
  code: CvmStatementCode;
  version: CvmStatementVersion;
};

export type CvmScale = "MIL" | "UNIDADE";

export type CvmPeriodType = "instant" | "quarter" | "ytd" | "year";

export type CvmStatementColumns = {
  CNPJ_CIA: number;
  DT_REFER: number;
  VERSAO: number;
  MOEDA: number;
  ESCALA_MOEDA: number;
  DT_INI_EXERC: number | undefined;
  DT_FIM_EXERC: number;
  CD_CONTA: number;
  DS_CONTA: number;
  VL_CONTA: number;
};

export type CvmStatementCandidate = {
  key: string;
  referenceDate: string;
  version: number;
  row: ProviderRow;
};

export type CvmStatementScan = {
  cnpjDigits: string;
  key: CvmKey;
  keyToCandidate: Map<string, CvmStatementCandidate>;
};
