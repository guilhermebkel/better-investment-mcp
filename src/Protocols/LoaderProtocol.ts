import type { ProviderResult } from "@/Protocols/ProviderProtocol.ts";
import type { Requirement } from "@/Protocols/SqlGuardProtocol.ts";

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
};

export type LoaderPort = { ensure(requirements: readonly Requirement[]): Promise<LoadedEntry[]> };

export type FetchAttempt = {
  result: ProviderResult | undefined;
  errorMessage: string | undefined;
};

export type FetchOutcome = FetchAttempt & {
  vendor: string;
  isFallback: boolean;
};

export type TableToColumns = Record<string, string[]>;
