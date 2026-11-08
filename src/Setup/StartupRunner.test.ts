import { afterEach, describe, expect, it, vi } from "vitest";
import { InvalidEnvError } from "@/Errors/InvalidEnvError.ts";
import { UnknownCommandError } from "@/Errors/UnknownCommandError.ts";
import { StartupRunner } from "@/Setup/StartupRunner.ts";

describe("StartupRunner.run()", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("logs the start-up event to stderr and writes the client configuration for init, never to stdout", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    await StartupRunner.run(["init"]);

    expect(stderr).toHaveBeenNthCalledWith(1, "{\"level\":\"info\",\"event\":\"environment_valid\"}\n");
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
});
