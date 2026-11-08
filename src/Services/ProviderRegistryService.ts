import { ProviderConfigError } from "@/Errors/ProviderConfigError.ts";
import { ProviderUnavailableError } from "@/Errors/ProviderUnavailableError.ts";
import type { CacheCategory } from "@/Protocols/CacheProtocol.ts";
import type { Env } from "@/Protocols/EnvProtocol.ts";
import type {
  CategoryToVendors,
  ProviderPort,
  ProviderSettingName,
  ResolvedProviders,
  VendorSettings,
} from "@/Protocols/ProviderProtocol.ts";

const SETTING_ENTRY_PATTERN = /^([A-Z]{2,6}):([a-z0-9_]+)(?:>([a-z0-9_]+))?$/;

export class ProviderRegistryService {
  static readonly CATEGORY_TO_SETTING: Record<CacheCategory, ProviderSettingName> = {
    quotes: "INVESTMENT_MCP_QUOTES_PROVIDER",
    dividends: "INVESTMENT_MCP_DIVIDENDS_PROVIDER",
    fundamentals: "INVESTMENT_MCP_FUNDAMENTALS_PROVIDER",
    statements: "INVESTMENT_MCP_STATEMENTS_PROVIDER",
    fund_data: "INVESTMENT_MCP_FUND_DATA_PROVIDER",
    filings: "INVESTMENT_MCP_FILINGS_PROVIDER",
    documents: "INVESTMENT_MCP_DOCUMENTS_PROVIDER",
    macro: "INVESTMENT_MCP_MACRO_PROVIDER",
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

  private findProvider(
    category: CacheCategory,
    vendor: string,
    market: string,
    assetType: string | undefined,
  ): ProviderPort {
    const vendorToProvider: Record<string, ProviderPort> = this.catalog[category];
    if (!Object.hasOwn(vendorToProvider, vendor)) {
      throw new ProviderUnavailableError(`${vendor} is not a known ${category} provider`);
    }
    const provider = vendorToProvider[vendor];
    if (!provider?.markets.includes(market)) {
      throw new ProviderUnavailableError(`${vendor} does not serve ${market} ${category}`);
    }
    if (assetType !== undefined && !provider.assetTypes.includes(assetType)) {
      throw new ProviderUnavailableError(`${vendor} does not serve ${assetType} assets in ${category}`);
    }
    return provider;
  }

  private static parseSetting(env: Env, category: CacheCategory): VendorSettings {
    const setting = ProviderRegistryService.CATEGORY_TO_SETTING[category];
    const value = env[setting];
    const settings: VendorSettings = { marketToPrimary: {}, marketToFallback: {} };
    if (value === undefined || value.trim() === "") {
      return settings;
    }
    for (const rawEntry of value.split(",")) {
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
