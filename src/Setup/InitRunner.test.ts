import { afterEach, describe, expect, it, vi } from "vitest";
import { InitRunner } from "@/Setup/InitRunner.ts";

describe("InitRunner.run()", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("prints the JSON client configuration with the npx command on stderr", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);

    InitRunner.run();

    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("{\n  \"mcpServers\": {\n    \"better-investment\": {\n      \"command\": \"npx\",\n      \"args\": [\"-y\", \"better-investment-mcp\"]\n    }\n  }\n}"));
  });

  it("prints the Codex configuration as TOML, since Codex does not read JSON", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);

    InitRunner.run();

    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("[mcp_servers.better-investment]\ncommand = \"npx\"\nargs = [\"-y\", \"better-investment-mcp\"]"));
  });

  it("prints the Docker configuration with the cache in a named volume", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);

    InitRunner.run();

    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("\"command\": \"docker\""));
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("\"-v\", \"better-investment-cache:/cache\""));
  });

  it("prints the Docker HTTP command with a placeholder token, never a value from the environment", () => {
    vi.stubEnv("INVESTMENT_MCP_HTTP_TOKEN", "fake-secret-value-456");
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);

    InitRunner.run();

    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("-e INVESTMENT_MCP_TRANSPORT=http -e INVESTMENT_MCP_HTTP_HOST=0.0.0.0"));
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("\"url\": \"http://127.0.0.1:3100/mcp\""));
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("your-long-random-secret"));
    expect(stderr).not.toHaveBeenCalledWith(expect.stringContaining("fake-secret-value-456"));
  });

  it("never prints a secret from the environment", () => {
    vi.stubEnv("INVESTMENT_MCP_CACHE_DIR", "fake-secret-value-123");
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    InitRunner.run();

    expect(stderr).not.toHaveBeenCalledWith(expect.stringContaining("fake-secret-value-123"));
    expect(stdout).not.toHaveBeenCalled();
  });
});
