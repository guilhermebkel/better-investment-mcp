import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Env } from "@/Protocols/EnvProtocol.ts";
import { McpRuntimeSurface } from "@/Surfaces/McpRuntimeSurface.ts";

export class StdioRunner {
  static async run(env: Env): Promise<void> {
    const runtime = await McpRuntimeSurface.open(env);
    await runtime.buildMcpServer().connect(new StdioServerTransport());
  }
}
