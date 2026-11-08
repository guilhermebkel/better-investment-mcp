export type CacheCategory = "quotes" | "dividends" | "fundamentals" | "statements" | "fund_data" | "filings" | "documents" | "macro";

export type CacheRunStart = {
  category: CacheCategory;
  market: string;
  ticker: string;
  source: string;
};

export type CacheRunOutcome = {
  rowsRead: number;
  errorMessage?: string;
};

export type CacheLoadResult = { rowsRead: number };

export type FreshRunRow = { freshRunCount: number };
