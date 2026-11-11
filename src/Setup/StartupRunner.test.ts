import { afterEach, describe, expect, it, vi } from "vitest";
import { InvalidEnvError } from "@/Errors/InvalidEnvError.ts";
import { UnhealthyError } from "@/Errors/UnhealthyError.ts";
import { UnknownCommandError } from "@/Errors/UnknownCommandError.ts";
import { StartupRunner } from "@/Setup/StartupRunner.ts";
import { HttpFixture } from "@/Testing/HttpFixture.ts";

describe("StartupRunner.run()", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("logs the start-up event to stderr and writes the client configuration for init, never to stdout", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    await StartupRunner.run(["init"]);

    expect(stderr).toHaveBeenNthCalledWith(1, expect.stringMatching(/^\{"time":"[^"]+","level":"info","event":"environment_valid"\}\n$/u));
    expect(stderr).toHaveBeenCalledTimes(2);
    expect(stdout).not.toHaveBeenCalled();
  });

  it("rejects with InvalidEnvError when a variable is wrong", async () => {
    vi.stubEnv("INVESTMENT_MCP_CACHE_TTL_SECONDS", "zero");

    await expect(StartupRunner.run(["init"])).rejects.toThrow(InvalidEnvError);
  });

  it("rejects with UnknownCommandError for a command that does not exist", async () => {
    vi.spyOn(process.stderr, "write").mockReturnValue(true);

    await expect(StartupRunner.run(["serve"])).rejects.toThrow(UnknownCommandError);
  });

  it("passes the health command over stdio, where there is nothing to probe", async () => {
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    vi.stubEnv("INVESTMENT_MCP_TRANSPORT", "stdio");

    await expect(StartupRunner.run(["health"])).resolves.toBeUndefined();
  });

  it("fails the health command in HTTP mode when nothing answers on the port", async () => {
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    vi.stubEnv("INVESTMENT_MCP_TRANSPORT", "http");
    vi.stubEnv("INVESTMENT_MCP_HTTP_TOKEN", "test-token-12345678");
    vi.stubEnv("INVESTMENT_MCP_HTTP_PORT", String(await HttpFixture.findFreePort()));

    await expect(StartupRunner.run(["health"])).rejects.toThrow(UnhealthyError);
  });
});
