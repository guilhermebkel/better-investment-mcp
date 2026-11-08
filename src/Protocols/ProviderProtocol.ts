import type { CacheCategory } from "@/Protocols/CacheProtocol.ts";
import type { DatabaseValue } from "@/Protocols/DatabaseProtocol.ts";
import type { DividendProvider } from "@/Protocols/DividendProviderProtocol.ts";
import type { DocumentProvider } from "@/Protocols/DocumentProviderProtocol.ts";
import type { FilingProvider } from "@/Protocols/FilingProviderProtocol.ts";
import type { FundDataProvider } from "@/Protocols/FundDataProviderProtocol.ts";
import type { FundamentalsProvider } from "@/Protocols/FundamentalsProviderProtocol.ts";
import type { MacroProvider } from "@/Protocols/MacroProviderProtocol.ts";
import type { QuoteProvider } from "@/Protocols/QuoteProviderProtocol.ts";
import type { StatementProvider } from "@/Protocols/StatementProviderProtocol.ts";

export type ColumnToValue = Record<string, DatabaseValue>;

export type ProviderRow = ColumnToValue;

export type TableToRows = Record<string, ProviderRow[]>;

export type ProviderRequest = {
  market: string;
  ticker: string;
  assetType?: string;
};

export type ProviderResult = {
  source: string;
  tables: TableToRows;
};

export type ProviderPort<Category extends CacheCategory = CacheCategory> = {
  category: Category;
  vendor: string;
  markets: readonly string[];
  assetTypes: readonly string[];
  fetchTables(request: ProviderRequest): Promise<ProviderResult>;
};

export type ResolvedProviders = {
  primary: ProviderPort;
  fallback?: ProviderPort;
};

export type ProviderSettingName
  = "INVESTMENT_MCP_QUOTES_PROVIDER"
    | "INVESTMENT_MCP_DIVIDENDS_PROVIDER"
    | "INVESTMENT_MCP_FUNDAMENTALS_PROVIDER"
    | "INVESTMENT_MCP_STATEMENTS_PROVIDER"
    | "INVESTMENT_MCP_FUND_DATA_PROVIDER"
    | "INVESTMENT_MCP_FILINGS_PROVIDER"
    | "INVESTMENT_MCP_DOCUMENTS_PROVIDER"
    | "INVESTMENT_MCP_MACRO_PROVIDER";

export type VendorToProvider<Provider> = Record<string, Provider>;

export type CategoryToVendors = {
  quotes: VendorToProvider<QuoteProvider>;
  dividends: VendorToProvider<DividendProvider>;
  fundamentals: VendorToProvider<FundamentalsProvider>;
  statements: VendorToProvider<StatementProvider>;
  fund_data: VendorToProvider<FundDataProvider>;
  filings: VendorToProvider<FilingProvider>;
  documents: VendorToProvider<DocumentProvider>;
  macro: VendorToProvider<MacroProvider>;
};

export type MarketToVendor = Record<string, string>;

export type VendorSettings = {
  marketToPrimary: MarketToVendor;
  marketToFallback: MarketToVendor;
};
