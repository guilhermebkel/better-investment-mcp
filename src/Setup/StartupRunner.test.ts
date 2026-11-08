import { afterEach, describe, expect, it, vi } from "vitest";
import { InvalidEnvError } from "@/Errors/InvalidEnvError.ts";
import { StartupRunner } from "@/Setup/StartupRunner.ts";

describe("StartupRunner.run()", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("logs to stderr once when the environment is valid and writes nothing to stdout", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    StartupRunner.run();

    expect(stderr).toHaveBeenCalledExactlyOnceWith("{\"level\":\"info\",\"event\":\"environment_valid\"}\n");
    expect(stdout).not.toHaveBeenCalled();
  });

  it("throws when a variable is wrong", () => {
    vi.stubEnv("INVESTMENT_MCP_CACHE_TTL_SECONDS", "zero");

    expect(() => {
      StartupRunner.run();
    }).toThrow(InvalidEnvError);
  });
});
