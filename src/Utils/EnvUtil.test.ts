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

  describe("when the transport is set", () => {
    it("defaults to stdio, on 127.0.0.1 port 3100, with no token", () => {
      vi.stubEnv("INVESTMENT_MCP_TRANSPORT", undefined);
      vi.stubEnv("INVESTMENT_MCP_HTTP_HOST", undefined);
      vi.stubEnv("INVESTMENT_MCP_HTTP_PORT", undefined);
      vi.stubEnv("INVESTMENT_MCP_HTTP_TOKEN", undefined);

      const env = EnvUtil.read();

      expect(env.INVESTMENT_MCP_TRANSPORT).toBe("stdio");
      expect(env.INVESTMENT_MCP_HTTP_HOST).toBe("127.0.0.1");
      expect(env.INVESTMENT_MCP_HTTP_PORT).toBe(3100);
      expect(env.INVESTMENT_MCP_HTTP_TOKEN).toBeUndefined();
    });

    it.each(["stdio", "http"])("accepts %s", (transport) => {
      vi.stubEnv("INVESTMENT_MCP_TRANSPORT", transport);

      expect(EnvUtil.read().INVESTMENT_MCP_TRANSPORT).toBe(transport);
    });

    it("refuses another transport and names the variable", () => {
      vi.stubEnv("INVESTMENT_MCP_TRANSPORT", "sse");

      expect(() => EnvUtil.read()).toThrow(/INVESTMENT_MCP_TRANSPORT must be stdio or http\./);
    });

    it("refuses a token shorter than eight characters and names the variable", () => {
      vi.stubEnv("INVESTMENT_MCP_HTTP_TOKEN", "short");

      expect(() => EnvUtil.read()).toThrow(/INVESTMENT_MCP_HTTP_TOKEN must be at least 8 characters\./);
    });

    it("keeps a token of eight characters or more", () => {
      vi.stubEnv("INVESTMENT_MCP_HTTP_TOKEN", "long-enough-token");

      expect(EnvUtil.read().INVESTMENT_MCP_HTTP_TOKEN).toBe("long-enough-token");
    });

    it.each(["0", "-1", "abc", "3100.5"])("refuses the port %s and names the variable", (value) => {
      vi.stubEnv("INVESTMENT_MCP_HTTP_PORT", value);

      expect(() => EnvUtil.read()).toThrow(/INVESTMENT_MCP_HTTP_PORT must be a positive integer\./);
    });
  });
});
