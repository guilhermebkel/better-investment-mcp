import type { PeriodWindow } from "@/Protocols/PeriodProtocol.ts";

export type CacheCategory = "quotes" | "dividends" | "fundamentals" | "statements" | "fund_data" | "filings" | "documents" | "macro" | "treasury" | "expectations" | "identifiers" | "registry" | "fx" | "fund";

export type CacheRunStart = {
  category: CacheCategory;
  market: string;
  ticker: string;
  source: string;
  filingId?: string;
  period?: PeriodWindow;
};

export type CacheRunOutcome = {
  rowsRead: number;
  errorMessage?: string;
};

export type CacheLoadResult = {
  rowsWritten: number;
  source?: string;
  isFallback: boolean;
  errorMessage?: string;
  pagesWithoutText?: number;
  indexError?: string;
};

export type FreshRunRow = { freshRunCount: number };
