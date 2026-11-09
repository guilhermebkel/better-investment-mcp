import { afterEach, describe, expect, it, vi } from "vitest";
import { InvalidEnvError } from "@/Errors/InvalidEnvError.ts";
import { EnvUtil } from "@/Utils/EnvUtil.ts";

describe("EnvUtil.read()", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("when no variable is set", () => {
    it("uses the defaults and leaves every provider and the cache directory unset", () => {
      vi.stubEnv("INVESTMENT_MCP_LOG_LEVEL", undefined);
      vi.stubEnv("INVESTMENT_MCP_CACHE_TTL_SECONDS", undefined);

      const env = EnvUtil.read();

      expect(env.INVESTMENT_MCP_LOG_LEVEL).toBe("info");
      expect(env.INVESTMENT_MCP_CACHE_TTL_SECONDS).toBe(86_400);
      expect(env.INVESTMENT_MCP_CACHE_DIR).toBeUndefined();
      expect(env.INVESTMENT_MCP_QUOTES_PROVIDER).toBeUndefined();
    });
  });

  describe("when the log level is set", () => {
    it.each(["error", "info", "debug"])("accepts %s", (level) => {
      vi.stubEnv("INVESTMENT_MCP_LOG_LEVEL", level);

      expect(EnvUtil.read().INVESTMENT_MCP_LOG_LEVEL).toBe(level);
    });

    it("treats an empty value as info", () => {
      vi.stubEnv("INVESTMENT_MCP_LOG_LEVEL", "");

      expect(EnvUtil.read().INVESTMENT_MCP_LOG_LEVEL).toBe("info");
    });

    it("refuses a level that does not exist and names the variable and the valid values", () => {
      vi.stubEnv("INVESTMENT_MCP_LOG_LEVEL", "loud");

      expect(() => EnvUtil.read()).toThrow(InvalidEnvError);
      expect(() => EnvUtil.read()).toThrow(/INVESTMENT_MCP_LOG_LEVEL must be error, info or debug\./);
    });
  });

  describe("when the cache time to live is set", () => {
    it("reads a positive number of seconds", () => {
      vi.stubEnv("INVESTMENT_MCP_CACHE_TTL_SECONDS", "3600");

      expect(EnvUtil.read().INVESTMENT_MCP_CACHE_TTL_SECONDS).toBe(3600);
    });

    it.each(["0", "-5", "abc", "1.5", "10s"])("refuses %s and names the variable", (value) => {
      vi.stubEnv("INVESTMENT_MCP_CACHE_TTL_SECONDS", value);

      expect(() => EnvUtil.read()).toThrow(/INVESTMENT_MCP_CACHE_TTL_SECONDS must be a positive integer\./);
    });
  });

  describe("when the background threshold is set", () => {
    it("defaults to five seconds", () => {
      expect(EnvUtil.read().INVESTMENT_MCP_BACKGROUND_AFTER_SECONDS).toBe(5);
    });

    it("reads a positive number of seconds", () => {
      vi.stubEnv("INVESTMENT_MCP_BACKGROUND_AFTER_SECONDS", "12");

      expect(EnvUtil.read().INVESTMENT_MCP_BACKGROUND_AFTER_SECONDS).toBe(12);
    });

    it.each(["0", "-1", "abc", "2.5"])("refuses %s and names the variable", (value) => {
      vi.stubEnv("INVESTMENT_MCP_BACKGROUND_AFTER_SECONDS", value);

      expect(() => EnvUtil.read()).toThrow(/INVESTMENT_MCP_BACKGROUND_AFTER_SECONDS must be a positive integer\./);
    });
  });

  describe("when a provider or the cache directory is set", () => {
    it("keeps the text as it is", () => {
      vi.stubEnv("INVESTMENT_MCP_QUOTES_PROVIDER", "BR:yahoo,US:yahoo");
      vi.stubEnv("INVESTMENT_MCP_CACHE_DIR", "/tmp/investment-cache");

      const env = EnvUtil.read();

      expect(env.INVESTMENT_MCP_QUOTES_PROVIDER).toBe("BR:yahoo,US:yahoo");
      expect(env.INVESTMENT_MCP_CACHE_DIR).toBe("/tmp/investment-cache");
    });

    it("treats an empty value as unset", () => {
      vi.stubEnv("INVESTMENT_MCP_MACRO_PROVIDER", "");

      expect(EnvUtil.read().INVESTMENT_MCP_MACRO_PROVIDER).toBeUndefined();
    });
  });
});
