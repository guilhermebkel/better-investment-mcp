import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Env } from "@/Protocols/EnvProtocol.ts";
import { StoreService } from "@/Services/StoreService.ts";
import { McpServerSurface } from "@/Surfaces/McpServerSurface.ts";

export class StdioRunner {
  static async run(env: Env): Promise<void> {
    await StoreService.prepare(env);
    const server = McpServerSurface.build();
    await server.connect(new StdioServerTransport());
  }
}
