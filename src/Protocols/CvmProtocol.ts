export type LegalIdLookup = (market: string, ticker: string) => Promise<string | undefined>;

export type CvmFilingKind = "itr" | "dfp" | "fre" | "sustainability" | "material_fact" | "other";

export type CvmKey = {
  market: string;
  ticker: string;
  asset_type: string;
};

export type KnownCvmCategory = "Fato Relevante" | "Relatório de Sustentabilidade";
