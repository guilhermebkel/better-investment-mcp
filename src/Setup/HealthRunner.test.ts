import { rmSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { UnhealthyError } from "@/Errors/UnhealthyError.ts";
import { HealthRunner } from "@/Setup/HealthRunner.ts";
import { HttpRunner } from "@/Setup/HttpRunner.ts";
import { HttpFixture } from "@/Testing/HttpFixture.ts";

const cacheDirs: string[] = [];

afterEach(() => {
  for (const cacheDir of cacheDirs.splice(0)) {
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

describe("HealthRunner.check()", () => {
  it("is healthy over stdio, where there is no listener to probe", async () => {
    const env = HttpFixture.buildEnv({ INVESTMENT_MCP_TRANSPORT: "stdio" });

    const isHealthy = await HealthRunner.check(env);

    expect(isHealthy).toBe(true);
  });

  it("is unhealthy in HTTP mode when nothing answers on the port", async () => {
    const port = await HttpFixture.findFreePort();
    const env = HttpFixture.buildEnv({ INVESTMENT_MCP_TRANSPORT: "http", INVESTMENT_MCP_HTTP_PORT: port });

    const isHealthy = await HealthRunner.check(env);

    expect(isHealthy).toBe(false);
  });

  it("is healthy in HTTP mode when the server answers ok on /health", async () => {
    const cacheDir = HttpFixture.makeCacheDir();
    cacheDirs.push(cacheDir);
    const port = await HttpFixture.findFreePort();
    const env = HttpFixture.buildHttpEnv(cacheDir, port);
    const handle = await HttpRunner.start(env);
    try {
      const isHealthy = await HealthRunner.check(env);
      expect(isHealthy).toBe(true);
    } finally {
      await handle.close();
    }
  });

  it("makes run() throw UnhealthyError when HTTP mode is set and nothing answers", async () => {
    const port = await HttpFixture.findFreePort();
    const env = HttpFixture.buildEnv({ INVESTMENT_MCP_TRANSPORT: "http", INVESTMENT_MCP_HTTP_PORT: port });

    const run = HealthRunner.run(env);

    await expect(run).rejects.toThrow(UnhealthyError);
  });
});
