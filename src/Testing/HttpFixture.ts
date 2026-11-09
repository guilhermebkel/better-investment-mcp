import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Env } from "@/Protocols/EnvProtocol.ts";

const LOOPBACK_HOST = "127.0.0.1";

export class HttpFixture {
  static readonly TOKEN = "test-token-12345678";

  static makeCacheDir(): string {
    const root = tmpdir();
    return mkdtempSync(join(root, "investment-http-test-"));
  }

  static findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      // Why: the port is taken from the system and released again, so the test server binds to a port nothing else uses.
      const probe = createServer();
      probe.once("error", reject);
      probe.listen(0, LOOPBACK_HOST, () => {
        const address = probe.address();
        if (address === null || typeof address === "string") {
          reject(new Error("The probe did not bind to a port."));
          return;
        }
        probe.close(() => {
          resolve(address.port);
        });
      });
    });
  }

  static buildEnv(overrides: Partial<Env> = {}): Env {
    return {
      INVESTMENT_MCP_LOG_LEVEL: "info",
      INVESTMENT_MCP_CACHE_TTL_SECONDS: 86_400,
      INVESTMENT_MCP_TRANSPORT: "stdio",
      ...overrides,
    };
  }

  static buildHttpEnv(cacheDir: string, port: number, overrides: Partial<Env> = {}): Env {
    return HttpFixture.buildEnv({
      INVESTMENT_MCP_CACHE_DIR: cacheDir,
      INVESTMENT_MCP_TRANSPORT: "http",
      INVESTMENT_MCP_HTTP_HOST: LOOPBACK_HOST,
      INVESTMENT_MCP_HTTP_PORT: port,
      INVESTMENT_MCP_HTTP_TOKEN: HttpFixture.TOKEN,
      ...overrides,
    });
  }
}
