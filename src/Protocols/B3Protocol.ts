export type B3StockIdentifiers = {
  legalId: string;
  isin: string;
  companyName: string | null;
};

export type B3FundIdentifiers = {
  legalId: string;
  fundName: string | null;
};

export type B3TickerListing = {
  tradingCode: string | null;
  tradingCodeOthers: string | null;
};

export type CotahistField = readonly [number, number];
