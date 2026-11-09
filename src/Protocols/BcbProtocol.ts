export type BcbSeriesDefinition = {
  name: string;
  code: number;
  unit: string;
  assetType: "index" | "tax_rate";
};

export type DateWindow = {
  from: Date;
  to: Date;
};
