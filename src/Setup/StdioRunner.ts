import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Env } from "@/Protocols/EnvProtocol.ts";
import { LoaderService } from "@/Services/LoaderService.ts";
import { ProviderRegistryService } from "@/Services/ProviderRegistryService.ts";
import { SqlGuardService } from "@/Services/SqlGuardService.ts";
import { StoreService } from "@/Services/StoreService.ts";
import { McpServerSurface } from "@/Surfaces/McpServerSurface.ts";

export class StdioRunner {
  static async run(env: Env): Promise<void> {
    const store = await StoreService.open(env);
    const registry = new ProviderRegistryService(env, ProviderRegistryService.buildEmptyCatalog());
    const server = McpServerSurface.build({
      querySql: {
        guard: new SqlGuardService(store.writer),
        loader: new LoaderService(store, registry),
        openReader: () => store.openReader(),
      },
    });
    await server.connect(new StdioServerTransport());
  }
}
