import { VendorCatalogService } from "@/Services/VendorCatalogService.ts";
import { describe, expect, it } from "vitest";
import { ProviderConfigError } from "@/Errors/ProviderConfigError.ts";
import { ProviderUnavailableError } from "@/Errors/ProviderUnavailableError.ts";
import type { Env } from "@/Protocols/EnvProtocol.ts";
import { ProviderRegistryService } from "@/Services/ProviderRegistryService.ts";
import { FakeProvider } from "@/Testing/FakeProvider.ts";

const NO_SETTINGS = { INVESTMENT_MCP_LOG_LEVEL: "error" as const, INVESTMENT_MCP_CACHE_TTL_SECONDS: 86_400 };

const EMPTY_RESULT = { source: "fake", tables: {} };
const buildEnv = (overrides: Partial<Env>): Env => ({ ...overrides, INVESTMENT_MCP_LOG_LEVEL: "error", INVESTMENT_MCP_CACHE_TTL_SECONDS: 60 });
const buildProvider = (vendor: string, markets: string[]): FakeProvider<"quotes"> => new FakeProvider({
  vendor,
  markets,
  category: "quotes",
  assetTypes: ["stock"],
  respond: () => Promise.resolve(EMPTY_RESULT),
});

describe("ProviderRegistryService.resolve()", () => {
  describe("when the variable names the primary vendor for the market", () => {
    it("returns that provider", () => {
      const yahoo = buildProvider("yahoo", ["BR"]);
      const registry = new ProviderRegistryService(buildEnv({ INVESTMENT_MCP_QUOTES_PROVIDER: "BR:yahoo" }), { ...ProviderRegistryService.buildEmptyCatalog(), quotes: { yahoo } });

      const resolved = registry.resolve("quotes", "BR", "stock");
      expect(resolved).toStrictEqual({ primary: yahoo });
    });
  });

  describe("when the market is not named in the variable", () => {
    it("refuses with the market and the category, so the agent learns that no provider serves it", () => {
      const registry = new ProviderRegistryService(buildEnv({ INVESTMENT_MCP_QUOTES_PROVIDER: "BR:alpha" }), ProviderRegistryService.buildEmptyCatalog());

      expect(() => registry.resolve("quotes", "US", "stock")).toThrow(ProviderUnavailableError);
      expect(() => registry.resolve("quotes", "US", "stock")).toThrow("no provider serves US quotes");
    });
  });

  describe("when the variable names a vendor that is not in the catalog", () => {
    it("refuses and names the vendor", () => {
      const registry = new ProviderRegistryService(buildEnv({ INVESTMENT_MCP_QUOTES_PROVIDER: "BR:alpha" }), ProviderRegistryService.buildEmptyCatalog());

      expect(() => registry.resolve("quotes", "BR", "stock")).toThrow("alpha is not a known quotes provider");
    });
  });

  describe("when the provider does not serve the asset type", () => {
    it("refuses and names the asset type", () => {
      const yahoo = buildProvider("yahoo", ["BR"]);
      const registry = new ProviderRegistryService(buildEnv({ INVESTMENT_MCP_QUOTES_PROVIDER: "BR:yahoo" }), { ...ProviderRegistryService.buildEmptyCatalog(), quotes: { yahoo } });

      expect(() => registry.resolve("quotes", "BR", "fii")).toThrow("yahoo does not serve fii assets in quotes");
    });
  });

  describe("when the registry is asked for a fund or an FII", () => {
    it("says the company registry covers stocks only, and where the data is", () => {
      const cvm = new FakeProvider({
        vendor: "cvm",
        markets: ["BR"],
        category: "registry",
        assetTypes: ["stock"],
        respond: () => Promise.resolve(EMPTY_RESULT),
      });
      const registry = new ProviderRegistryService(buildEnv({ INVESTMENT_MCP_REGISTRY_PROVIDER: "BR:cvm" }), { ...ProviderRegistryService.buildEmptyCatalog(), registry: { cvm } });

      expect(() => registry.resolve("registry", "BR", "fii")).toThrow("the company registry covers stocks only");
    });
  });

  describe("when a fallback is named after the primary", () => {
    it("returns both, so the loader can use the fallback when the primary fails", () => {
      const yahoo = buildProvider("yahoo", ["BR"]);
      const alpha = buildProvider("alpha", ["BR"]);
      const registry = new ProviderRegistryService(
        buildEnv({ INVESTMENT_MCP_QUOTES_PROVIDER: "BR:yahoo>alpha" }),
        { ...ProviderRegistryService.buildEmptyCatalog(), quotes: { yahoo, alpha } },
      );

      const resolved = registry.resolve("quotes", "BR", "stock");
      expect(resolved).toStrictEqual({ primary: yahoo, fallback: alpha });
    });
  });
});

describe("ProviderRegistryService.buildEmptyCatalog()", () => {
  describe("when a setting is malformed", () => {
    it("refuses at start with the entry and the expected form", () => {
      expect(() => new ProviderRegistryService(buildEnv({ INVESTMENT_MCP_QUOTES_PROVIDER: "Brazil=yahoo" }), ProviderRegistryService.buildEmptyCatalog())).toThrow(ProviderConfigError);
      expect(() => new ProviderRegistryService(buildEnv({ INVESTMENT_MCP_QUOTES_PROVIDER: "Brazil=yahoo" }), ProviderRegistryService.buildEmptyCatalog())).toThrow("BR:yahoo, or BR:yahoo>fallback");
    });
  });

  it("uses yfinance for Brazilian quotes, with Yahoo as the fallback when it fails", () => {
    const registry = new ProviderRegistryService(NO_SETTINGS, VendorCatalogService.build());

    const resolved = registry.resolve("quotes", "BR", "stock");

    expect(resolved.primary.vendor).toBe("yfinance");
    expect(resolved.fallback?.vendor).toBe("b3");
  });

  it("uses the public source of each category without any variable", () => {
    const registry = new ProviderRegistryService(NO_SETTINGS, VendorCatalogService.build());

    expect(registry.resolve("macro", "BR", "index").primary.vendor).toBe("bcb");
    expect(registry.resolve("statements", "BR", "stock").primary.vendor).toBe("cvm");
    expect(registry.resolve("identifiers", "BR", "fii").primary.vendor).toBe("b3");
    expect(registry.resolve("fx", "BR", "currency").primary.vendor).toBe("bcb");
    expect(registry.resolve("fund", "BR", "fund").primary.vendor).toBe("cvm");
  });

  it("lets a variable replace the default when it is set", () => {
    const registry = new ProviderRegistryService(
      { ...NO_SETTINGS, INVESTMENT_MCP_QUOTES_PROVIDER: "BR:b3" },
      VendorCatalogService.build(),
    );

    expect(registry.resolve("quotes", "BR", "stock").primary.vendor).toBe("b3");
  });
});
