import type { PeriodWindow } from "@/Protocols/PeriodProtocol.ts";

export type CacheCategory = "quotes" | "dividends" | "fundamentals" | "statements" | "fund_data" | "filings" | "documents" | "macro" | "treasury" | "expectations" | "identifiers" | "registry" | "fx" | "fund" | "disclosures" | "proceedings" | "sector" | "index_membership" | "complaints" | "banking" | "news";

export type CacheRunStart = {
  category: CacheCategory;
  assetId: string;
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
  itemErrors?: string[];
  pagesWithoutText?: number;
  indexError?: string;
};

export type FreshRunRow = { freshRunCount: number };
