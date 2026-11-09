import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Env } from "@/Protocols/EnvProtocol.ts";
import { DEFAULT_BACKGROUND_AFTER_SECONDS } from "@/Schemas/EnvSchema.ts";
import { LoadJobService } from "@/Services/LoadJobService.ts";
import { LoaderService } from "@/Services/LoaderService.ts";
import { ProviderRegistryService } from "@/Services/ProviderRegistryService.ts";
import { SqlGuardService } from "@/Services/SqlGuardService.ts";
import { StoreService } from "@/Services/StoreService.ts";
import { VendorCatalogService } from "@/Services/VendorCatalogService.ts";
import { McpServerSurface } from "@/Surfaces/McpServerSurface.ts";

const MS_PER_SECOND = 1000;

export class StdioRunner {
  static readonly LOADED_QUERY = "SELECT asset_id, category, CAST(first_date AS VARCHAR) AS first_date, CAST(last_date AS VARCHAR) AS last_date, CAST(expires_at AS VARCHAR) AS expires_at FROM asset_coverage ORDER BY asset_id, category";

  static async run(env: Env): Promise<void> {
    const store = await StoreService.open(env);
    const registry = new ProviderRegistryService(env, VendorCatalogService.build());
    const loader = new LoaderService(store, registry);
    const jobs = new LoadJobService(loader);
    const backgroundAfterSeconds = env.INVESTMENT_MCP_BACKGROUND_AFTER_SECONDS ?? DEFAULT_BACKGROUND_AFTER_SECONDS;
    const server = McpServerSurface.build({
      querySql: {
        guard: new SqlGuardService(store.writer),
        openReader: () => store.openReader(),
        backgroundAfterMs: backgroundAfterSeconds * MS_PER_SECOND,
        loader,
        jobs,
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
