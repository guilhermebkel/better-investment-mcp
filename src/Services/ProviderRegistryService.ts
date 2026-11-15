import { ProviderConfigError } from "@/Errors/ProviderConfigError.ts";
import { ProviderUnavailableError } from "@/Errors/ProviderUnavailableError.ts";
import type { CacheCategory } from "@/Protocols/CacheProtocol.ts";
import type { Env } from "@/Protocols/EnvProtocol.ts";
import type { DocumentProvider } from "@/Protocols/DocumentProviderProtocol.ts";
import type {
  CategoryToVendors,
  ProviderPort,
  ProviderSettingName,
  ResolvedProviders,
  ServedVendor,
  VendorSettings,
} from "@/Protocols/ProviderProtocol.ts";

const SETTING_ENTRY_PATTERN = /^([A-Z]{2,6}):([a-z0-9_]+)(?:>([a-z0-9_]+))?$/;

// Why: the company registry covers listed companies only, so a fund or an FII asked of it is refused with where its data is.
const categoryToRefusalHint: Readonly<Partial<Record<CacheCategory, string>>> = {
  registry: "; the company registry covers stocks only, and a fund or an FII is read from its own files (fund data, filings and fund metrics)",
  fund: "; a fund is read by its CNPJ, as BR:fund:<CNPJ>, and this category holds funds only",
};

export class ProviderRegistryService {
  // Why: a category with no setting uses its default, so the server works with no provider variable; a default with a second vendor names it as the fallback, used when the first one fails.
  static readonly categoryToDefaultSetting: Record<CacheCategory, string> = {
    // Why: the Brazilian fallback is B3 (COTAHIST), not Yahoo: yfinance and Yahoo read the same service, so Yahoo cannot back it up.
    quotes: "BR:yfinance>b3,US:yfinance>yahoo",
    dividends: "BR:yfinance>yahoo,US:yfinance>yahoo",
    fundamentals: "BR:statusinvest",
    statements: "BR:cvm",
    fund_data: "BR:cvm",
    filings: "BR:cvm",
    documents: "BR:cvm",
    macro: "BR:bcb",
    treasury: "BR:tesouro",
    expectations: "BR:bcb",
    identifiers: "BR:b3",
    registry: "BR:cvm",
    fx: "BR:bcb",
    fund: "BR:cvm",
    disclosures: "BR:cvm",
    proceedings: "BR:cvm",
    sector: "BR:ibge",
    index_membership: "BR:b3",
    complaints: "BR:consumidor_gov",
    banking: "BR:bcb",
    news: "BR:gdelt",
  };

  static readonly CATEGORY_TO_SETTING: Record<CacheCategory, ProviderSettingName> = {
    quotes: "INVESTMENT_MCP_QUOTES_PROVIDER",
    dividends: "INVESTMENT_MCP_DIVIDENDS_PROVIDER",
    fundamentals: "INVESTMENT_MCP_FUNDAMENTALS_PROVIDER",
    statements: "INVESTMENT_MCP_STATEMENTS_PROVIDER",
    fund_data: "INVESTMENT_MCP_FUND_DATA_PROVIDER",
    filings: "INVESTMENT_MCP_FILINGS_PROVIDER",
    documents: "INVESTMENT_MCP_DOCUMENTS_PROVIDER",
    macro: "INVESTMENT_MCP_MACRO_PROVIDER",
    treasury: "INVESTMENT_MCP_TREASURY_PROVIDER",
    expectations: "INVESTMENT_MCP_EXPECTATIONS_PROVIDER",
    identifiers: "INVESTMENT_MCP_IDENTIFIERS_PROVIDER",
    registry: "INVESTMENT_MCP_REGISTRY_PROVIDER",
    fx: "INVESTMENT_MCP_FX_PROVIDER",
    fund: "INVESTMENT_MCP_FUND_PROVIDER",
    disclosures: "INVESTMENT_MCP_DISCLOSURES_PROVIDER",
    proceedings: "INVESTMENT_MCP_PROCEEDINGS_PROVIDER",
    sector: "INVESTMENT_MCP_SECTOR_PROVIDER",
    index_membership: "INVESTMENT_MCP_INDEX_MEMBERSHIP_PROVIDER",
    complaints: "INVESTMENT_MCP_COMPLAINTS_PROVIDER",
    banking: "INVESTMENT_MCP_BANKING_PROVIDER",
    news: "INVESTMENT_MCP_NEWS_PROVIDER",
  };

  private readonly categoryToSettings: Record<CacheCategory, VendorSettings>;
  private readonly catalog: CategoryToVendors;

  constructor(env: Env, catalog: CategoryToVendors) {
    this.catalog = catalog;
    this.categoryToSettings = {
      quotes: ProviderRegistryService.parseSetting(env, "quotes"),
      dividends: ProviderRegistryService.parseSetting(env, "dividends"),
      fundamentals: ProviderRegistryService.parseSetting(env, "fundamentals"),
      statements: ProviderRegistryService.parseSetting(env, "statements"),
      fund_data: ProviderRegistryService.parseSetting(env, "fund_data"),
      filings: ProviderRegistryService.parseSetting(env, "filings"),
      documents: ProviderRegistryService.parseSetting(env, "documents"),
      macro: ProviderRegistryService.parseSetting(env, "macro"),
      treasury: ProviderRegistryService.parseSetting(env, "treasury"),
      expectations: ProviderRegistryService.parseSetting(env, "expectations"),
      identifiers: ProviderRegistryService.parseSetting(env, "identifiers"),
      registry: ProviderRegistryService.parseSetting(env, "registry"),
      fx: ProviderRegistryService.parseSetting(env, "fx"),
      fund: ProviderRegistryService.parseSetting(env, "fund"),
      disclosures: ProviderRegistryService.parseSetting(env, "disclosures"),
      proceedings: ProviderRegistryService.parseSetting(env, "proceedings"),
      sector: ProviderRegistryService.parseSetting(env, "sector"),
      index_membership: ProviderRegistryService.parseSetting(env, "index_membership"),
      complaints: ProviderRegistryService.parseSetting(env, "complaints"),
      banking: ProviderRegistryService.parseSetting(env, "banking"),
      news: ProviderRegistryService.parseSetting(env, "news"),
    };
  }

  static buildEmptyCatalog(): CategoryToVendors {
    return {
      quotes: {},
      dividends: {},
      fundamentals: {},
      statements: {},
      fund_data: {},
      filings: {},
      documents: {},
      macro: {},
      treasury: {},
      expectations: {},
      identifiers: {},
      registry: {},
      fx: {},
      fund: {},
      disclosures: {},
      proceedings: {},
      sector: {},
      index_membership: {},
      complaints: {},
      banking: {},
      news: {},
    };
  }

  resolve(category: CacheCategory, market: string, assetType: string | undefined): ResolvedProviders {
    const settings = this.categoryToSettings[category];
    const setting = ProviderRegistryService.CATEGORY_TO_SETTING[category];
    if (!Object.hasOwn(settings.marketToPrimary, market)) {
      const detail = `${setting} names the markets each provider serves`;
      throw new ProviderUnavailableError(`no provider serves ${market} ${category}; ${detail}`);
    }
    const primaryName = settings.marketToPrimary[market] ?? "";
    const primary = this.findProvider(category, primaryName, market, assetType);
    if (!Object.hasOwn(settings.marketToFallback, market)) {
      return { primary };
    }
    const fallbackName = settings.marketToFallback[market] ?? "";
    return { primary, fallback: this.findProvider(category, fallbackName, market, assetType) };
  }

  resolveDocument(market: string, assetType: string | undefined): DocumentProvider {
    const settings = this.categoryToSettings.documents;
    if (!Object.hasOwn(settings.marketToPrimary, market)) {
      const detail = `${ProviderRegistryService.CATEGORY_TO_SETTING.documents} names the markets each provider serves`;
      throw new ProviderUnavailableError(`no provider serves ${market} documents; ${detail}`);
    }
    const vendor = settings.marketToPrimary[market] ?? "";
    const vendorToProvider = this.catalog.documents;
    const provider: DocumentProvider | undefined = vendorToProvider[vendor];
    if (provider === undefined || !Object.hasOwn(vendorToProvider, vendor)) {
      throw new ProviderUnavailableError(`${vendor} is not a known documents provider`);
    }
    ProviderRegistryService.assertServes("documents", vendor, provider, market, assetType);
    return provider;
  }

  private findProvider(
    category: CacheCategory,
    vendor: string,
    market: string,
    assetType: string | undefined,
  ): ProviderPort {
    const categoryVendors: unknown = this.catalog[category];
    const vendorToProvider = categoryVendors as Record<string, ProviderPort>;
    const provider: ProviderPort | undefined = vendorToProvider[vendor];
    if (provider === undefined || !Object.hasOwn(vendorToProvider, vendor)) {
      throw new ProviderUnavailableError(`${vendor} is not a known ${category} provider`);
    }
    ProviderRegistryService.assertServes(category, vendor, provider, market, assetType);
    return provider;
  }

  private static assertServes(
    category: CacheCategory,
    vendor: string,
    provider: ServedVendor,
    market: string,
    assetType: string | undefined,
  ): void {
    if (!provider.markets.includes(market)) {
      throw new ProviderUnavailableError(`${vendor} does not serve ${market} ${category}`);
    }
    if (assetType !== undefined && !provider.assetTypes.includes(assetType)) {
      // Why: the company registry covers listed companies only, so a fund or an FII asks the registry in vain; the message says where its data is.
      const hint = categoryToRefusalHint[category] ?? "";
      throw new ProviderUnavailableError(`${vendor} does not serve ${assetType} assets in ${category}${hint}`);
    }
  }

  private static parseSetting(env: Env, category: CacheCategory): VendorSettings {
    const setting = ProviderRegistryService.CATEGORY_TO_SETTING[category];
    const value = env[setting];
    const settings: VendorSettings = { marketToPrimary: {}, marketToFallback: {} };
    const text = value === undefined || value.trim() === "" ? ProviderRegistryService.categoryToDefaultSetting[category] : value;
    for (const rawEntry of text.split(",")) {
      const entry = rawEntry.trim();
      const match = SETTING_ENTRY_PATTERN.exec(entry);
      if (match === null) {
        throw new ProviderConfigError(`${setting} entry "${entry}" must look like BR:yahoo, or BR:yahoo>fallback`);
      }
      const [, market = "", primary = "", fallback] = match;
      settings.marketToPrimary[market] = primary;
      if (fallback !== undefined) {
        settings.marketToFallback[market] = fallback;
      }
    }
    return settings;
  }
}
