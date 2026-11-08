import type { CacheCategory } from "@/Protocols/CacheProtocol.ts";

export type DataTable
  = "quotes"
    | "splits"
    | "dividends"
    | "fundamentals"
    | "financial_statements"
    | "fii_monthly"
    | "filings"
    | "chunks"
    | "macro_series";

export type Requirement = {
  table: DataTable;
  category: CacheCategory;
  market: string;
  ticker: string;
  assetType?: string;
};

export type GuardAccepted = {
  isAccepted: true;
  requirements: Requirement[];
};

export type GuardRefused = {
  isAccepted: false;
  message: string;
};

export type GuardVerdict = GuardAccepted | GuardRefused;

export type SqlGuardPort = { checkSql(sql: string): Promise<GuardVerdict> };

export type Constraint = {
  qualifier?: string;
  column: string;
  values: string[];
};

export type ColumnRef = {
  qualifier?: string;
  column: string;
};

export type TableRef = {
  table: string;
  name: string;
};

export type SelectCheck = {
  problems: string[];
  requirements: Requirement[];
};

export type FromReading = {
  refs: TableRef[];
  joinConditions: unknown[];
  problems: string[];
};

export type TableFilters = {
  columns: readonly string[];
  anyOf: readonly string[];
};

export type ConditionType = "CONJUNCTION_AND" | "CONJUNCTION_OR" | "COMPARE_EQUAL" | "COMPARE_IN";

export type ConditionReader = (node: unknown, children: unknown[]) => Constraint[];
