import type { ChunkRow } from "@/Protocols/DocumentTextProtocol.ts";
import type { PeriodWindow } from "@/Protocols/PeriodProtocol.ts";
import type { ProviderResult } from "@/Protocols/ProviderProtocol.ts";
import type { Requirement } from "@/Protocols/SqlGuardProtocol.ts";
import type { CacheCategory } from "@/Protocols/CacheProtocol.ts";

export type LoadStatus = "fresh" | "loaded" | "failed";

export type Period = {
  from: string;
  to: string;
};

export type LoadedEntry = {
  category: Requirement["category"];
  market: string;
  ticker: string;
  status: LoadStatus;
  source?: string;
  isFallback: boolean;
  rowsWritten: number;
  period?: Period;
  error?: string;
  filingId?: string;
  pagesWithoutText?: number;
  indexError?: string;
  requestedPeriod?: PeriodWindow;
  periodicity?: string;
};

export type FilingRow = {
  filing_id: string;
  market: string;
  ticker: string;
  asset_type: string;
  filing_type: string;
  url: string | null;
  file_hash: string | null;
};

export type LoaderPort = { ensure(requirements: readonly Requirement[]): Promise<LoadedEntry[]> };

export type FetchAttempt = {
  result: ProviderResult | undefined;
  errorMessage: string | undefined;
  isFallbackBlocked: boolean;
};

export type FetchOutcome = FetchAttempt & {
  vendor: string;
  isFallback: boolean;
};

export type TableToColumns = Record<string, string[]>;

export type DownloadOutcome = {
  hash: string;
  chunks: ChunkRow[];
  pagesWithoutText: number;
  errorMessage?: string;
};

export type SqlScope = {
  sql: string;
  values: string[];
};

export type ScopeRule = (category: CacheCategory) => SqlScope;
