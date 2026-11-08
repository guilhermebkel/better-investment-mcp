import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpServerSurface } from "@/Surfaces/McpServerSurface.ts";

export class StdioRunner {
  static async run(): Promise<void> {
    const server = McpServerSurface.build();
    await server.connect(new StdioServerTransport());
  }
}
