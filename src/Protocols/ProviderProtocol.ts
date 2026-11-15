import type { CacheCategory } from "@/Protocols/CacheProtocol.ts";
import type { DatabaseValue } from "@/Protocols/DatabaseProtocol.ts";
import type { DividendProvider } from "@/Protocols/DividendProviderProtocol.ts";
import type { DocumentProvider } from "@/Protocols/DocumentProviderProtocol.ts";
import type { FilingProvider } from "@/Protocols/FilingProviderProtocol.ts";
import type { FundDataProvider } from "@/Protocols/FundDataProviderProtocol.ts";
import type { FundamentalsProvider } from "@/Protocols/FundamentalsProviderProtocol.ts";
import type { MacroProvider } from "@/Protocols/MacroProviderProtocol.ts";
import type { PeriodWindow } from "@/Protocols/PeriodProtocol.ts";
import type { QuoteProvider } from "@/Protocols/QuoteProviderProtocol.ts";
import type { StatementProvider } from "@/Protocols/StatementProviderProtocol.ts";
import type { ExpectationsProvider } from "@/Protocols/ExpectationsProviderProtocol.ts";
import type { IdentifiersProvider } from "@/Protocols/IdentifiersProviderProtocol.ts";
import type { DisclosuresProvider } from "@/Protocols/DisclosuresProviderProtocol.ts";
import type { ProceedingsProvider } from "@/Protocols/ProceedingsProviderProtocol.ts";
import type { SectorProvider } from "@/Protocols/SectorProviderProtocol.ts";
import type { IndexMembershipProvider } from "@/Protocols/IndexMembershipProviderProtocol.ts";
import type { ComplaintsProvider } from "@/Protocols/ComplaintsProviderProtocol.ts";
import type { BankingProvider } from "@/Protocols/BankingProviderProtocol.ts";
import type { NewsProvider } from "@/Protocols/NewsProviderProtocol.ts";
import type { FundProvider } from "@/Protocols/FundProviderProtocol.ts";
import type { FxProvider } from "@/Protocols/FxProviderProtocol.ts";
import type { RegistryProvider } from "@/Protocols/RegistryProviderProtocol.ts";
import type { TreasuryProvider } from "@/Protocols/TreasuryProviderProtocol.ts";

export type ColumnToValue = Record<string, DatabaseValue>;

export type ProviderRow = ColumnToValue;

export type TableToRows = Record<string, ProviderRow[]>;

export type ProviderRequest = {
  market: string;
  ticker: string;
  assetType?: string;
  period?: PeriodWindow;
};

export type ProviderFile = {
  url: string;
  dataset: string;
  referenceYear: number;
  sha256: string;
  sizeBytes: number;
};

export type ProviderResult = {
  source: string;
  tables: TableToRows;
  files?: ProviderFile[];
  itemErrors?: string[];
};

export type ProviderPort<Category extends CacheCategory = CacheCategory> = {
  category: Category;
  vendor: string;
  markets: readonly string[];
  assetTypes: readonly string[];
  fetchTables(request: ProviderRequest): Promise<ProviderResult>;
};

export type ServedVendor = {
  vendor: string;
  markets: readonly string[];
  assetTypes: readonly string[];
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
    | "INVESTMENT_MCP_MACRO_PROVIDER"
    | "INVESTMENT_MCP_TREASURY_PROVIDER"
    | "INVESTMENT_MCP_EXPECTATIONS_PROVIDER"
    | "INVESTMENT_MCP_IDENTIFIERS_PROVIDER"
    | "INVESTMENT_MCP_REGISTRY_PROVIDER"
    | "INVESTMENT_MCP_FX_PROVIDER"
    | "INVESTMENT_MCP_FUND_PROVIDER"
    | "INVESTMENT_MCP_DISCLOSURES_PROVIDER"
    | "INVESTMENT_MCP_PROCEEDINGS_PROVIDER"
    | "INVESTMENT_MCP_SECTOR_PROVIDER"
    | "INVESTMENT_MCP_INDEX_MEMBERSHIP_PROVIDER"
    | "INVESTMENT_MCP_COMPLAINTS_PROVIDER"
    | "INVESTMENT_MCP_BANKING_PROVIDER"
    | "INVESTMENT_MCP_NEWS_PROVIDER";

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
  treasury: VendorToProvider<TreasuryProvider>;
  expectations: VendorToProvider<ExpectationsProvider>;
  identifiers: VendorToProvider<IdentifiersProvider>;
  registry: VendorToProvider<RegistryProvider>;
  fx: VendorToProvider<FxProvider>;
  fund: VendorToProvider<FundProvider>;
  disclosures: VendorToProvider<DisclosuresProvider>;
  proceedings: VendorToProvider<ProceedingsProvider>;
  sector: VendorToProvider<SectorProvider>;
  index_membership: VendorToProvider<IndexMembershipProvider>;
  complaints: VendorToProvider<ComplaintsProvider>;
  banking: VendorToProvider<BankingProvider>;
  news: VendorToProvider<NewsProvider>;
};

export type MarketToVendor = Record<string, string>;

export type VendorSettings = {
  marketToPrimary: MarketToVendor;
  marketToFallback: MarketToVendor;
};
