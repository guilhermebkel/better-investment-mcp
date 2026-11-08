export type LegalIdLookup = (market: string, ticker: string) => Promise<string | undefined>;

import type { PeriodWindow } from "@/Protocols/PeriodProtocol.ts";
import type { ProviderFile, ProviderRow } from "@/Protocols/ProviderProtocol.ts";

export type CvmPeriodicKind = "itr" | "dfp" | "fre";

export type CvmFilingKind = CvmPeriodicKind | "sustainability" | "material_fact" | "management_report" | "other";

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
  periodEnd: string;
  version: number;
  row: ProviderRow;
};

export type CvmStatementScan = {
  cnpjDigits: string;
  key: CvmKey;
  window: PeriodWindow;
  keyToCandidate: Map<string, CvmStatementCandidate>;
  files: ProviderFile[];
};

export type CvmFiiTicker = "IRDM11";

export type CvmFundEntry = {
  cnpj: string;
  name: string;
};

export type CvmCollection = {
  cnpjDigits: string;
  key: CvmKey;
  window: PeriodWindow;
  files: ProviderFile[];
  filingIdToRow: Map<string, ProviderRow>;
};

export type CvmFundColumn
  = "Patrimonio_Liquido"
    | "Total_Necessidades_Liquidez"
    | "Disponibilidades"
    | "Titulos_Publicos"
    | "Titulos_Privados"
    | "Fundos_Renda_Fixa"
    | "Rendimentos_Distribuir";

export type FundMonthField
  = "net_worth"
    | "liquidity_requirement"
    | "cash_available"
    | "government_bonds"
    | "corporate_bonds"
    | "fixed_income_funds"
    | "distributable_income";

export type CvmFundDocType = "RELAT GERENCIAL" | "FATO RELEV";

export type FundFilingCollection = {
  cnpjDigits: string;
  key: CvmKey;
  window: PeriodWindow;
  files: ProviderFile[];
};

export type CvmCompanyEntry = {
  cnpj: string;
  referenceDate: string;
};

export type CvmCompanyColumns = {
  cnpj: number;
  ticker: number;
  reference: number;
};

export type CvmFundMonth = {
  version: number;
  sourceFiles: string[];
  fieldToValue: Partial<Record<FundMonthField, number | null>>;
};

export type StatementSource = {
  statement: string;
  sourceFile: string;
};

export type ColumnPairs = readonly (readonly [CvmFundColumn, FundMonthField])[];

export type FileScope = {
  cnpjDigits: string;
  window: PeriodWindow;
  periodToMonth: Map<string, CvmFundMonth>;
};

export type CvmSubject = {
  key: CvmKey;
  cnpjDigits: string;
  window: PeriodWindow;
};
