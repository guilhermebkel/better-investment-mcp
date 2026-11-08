import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Env } from "@/Protocols/EnvProtocol.ts";
import { LoaderService } from "@/Services/LoaderService.ts";
import { ProviderRegistryService } from "@/Services/ProviderRegistryService.ts";
import { SqlGuardService } from "@/Services/SqlGuardService.ts";
import { StoreService } from "@/Services/StoreService.ts";
import { VendorCatalogService } from "@/Services/VendorCatalogService.ts";
import { McpServerSurface } from "@/Surfaces/McpServerSurface.ts";

export class StdioRunner {
  static readonly LOADED_QUERY = "SELECT market, ticker, asset_type, category, source, CAST(expires_at AS VARCHAR) AS expires_at FROM asset_coverage ORDER BY market, ticker, category";

  static async run(env: Env): Promise<void> {
    const store = await StoreService.open(env);
    const lookup = StoreService.buildLegalIdLookup(store.writer);
    const registry = new ProviderRegistryService(env, VendorCatalogService.build(lookup));
    const server = McpServerSurface.build({
      querySql: {
        guard: new SqlGuardService(store.writer),
        loader: new LoaderService(store, registry),
        openReader: () => store.openReader(),
      },
      overview: {
        cacheTtlSeconds: env.INVESTMENT_MCP_CACHE_TTL_SECONDS,
        readLoaded: async () => {
          const reader = await store.openReader();
          try {
            return await reader.readRows(StdioRunner.LOADED_QUERY);
          } finally {
            reader.close();
          }
        },
      },
    });
    await server.connect(new StdioServerTransport());
  }
}
