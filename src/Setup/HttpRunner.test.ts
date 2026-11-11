import { rmSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { HttpTokenMissingError } from "@/Errors/HttpTokenMissingError.ts";
import type { Env } from "@/Protocols/EnvProtocol.ts";
import type { HttpServerHandle } from "@/Protocols/HttpRunnerProtocol.ts";
import { HttpRunner } from "@/Setup/HttpRunner.ts";
import { HttpFixture } from "@/Testing/HttpFixture.ts";

const WRONG_TOKEN = "wrong-token-123456789";
const TOOL_NAMES = ["get_guide", "get_overview", "notify_load_finish", "query_sql"];

const handles: HttpServerHandle[] = [];
const cacheDirs: string[] = [];

const startServer = async (overrides: Partial<Env> = {}) => {
  const cacheDir = HttpFixture.makeCacheDir();
  cacheDirs.push(cacheDir);
  const port = await HttpFixture.findFreePort();
  const env = HttpFixture.buildHttpEnv(cacheDir, port, overrides);
  const handle = await HttpRunner.start(env);
  handles.push(handle);
  return { handle, baseUrl: `http://127.0.0.1:${port}` };
};

const postMcp = (baseUrl: string, body: string, token?: string): Promise<Response> => fetch(`${baseUrl}/mcp`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
    ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
  },
  body,
});

afterEach(async () => {
  await Promise.all(handles.splice(0).map(async (handle) => handle.close()));
  for (const cacheDir of cacheDirs.splice(0)) {
    rmSync(cacheDir, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

describe("HttpRunner.start()", () => {
  it("refuses to start without a token, on any address", async () => {
    const cacheDir = HttpFixture.makeCacheDir();
    cacheDirs.push(cacheDir);
    const port = await HttpFixture.findFreePort();
    const env = HttpFixture.buildHttpEnv(cacheDir, port, { INVESTMENT_MCP_HTTP_TOKEN: undefined });

    const start = HttpRunner.start(env);

    await expect(start).rejects.toThrow(HttpTokenMissingError);
  });

  it("answers GET /health with ok, without a token", async () => {
    const { baseUrl } = await startServer();

    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });

  it("answers 401 on /mcp without a token and with a wrong one", async () => {
    const { baseUrl } = await startServer();
    const ping = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" });

    const anonymous = await postMcp(baseUrl, ping);
    const wrong = await postMcp(baseUrl, ping, WRONG_TOKEN);

    expect(anonymous.status).toBe(401);
    expect(wrong.status).toBe(401);
  });

  it("answers 404 on any other path", async () => {
    const { baseUrl } = await startServer();

    const response = await fetch(`${baseUrl}/other`);

    expect(response.status).toBe(404);
  });

  it("answers 400 to a body that is not JSON, when the token is right", async () => {
    const { baseUrl } = await startServer();

    const response = await postMcp(baseUrl, "{not json", HttpFixture.TOKEN);

    expect(response.status).toBe(400);
  });

  it("serves the three read-only tools to a client that sends the token", async () => {
    const { baseUrl } = await startServer();
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${HttpFixture.TOKEN}` } },
    });
    const client = new Client({ name: "http-runner-test", version: "0.0.0" });

    await client.connect(transport);
    const tools = await client.listTools();
    const serverName = client.getServerVersion()?.name;
    await client.close();

    expect(tools.tools.map((tool) => tool.name).sort()).toStrictEqual(TOOL_NAMES);
    expect(serverName).toBe("better-investment-mcp");
  });

  it("never writes the token to stderr", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const { baseUrl } = await startServer();
    await postMcp(baseUrl, "{}", HttpFixture.TOKEN);

    const written = stderr.mock.calls.map((call) => String(call[0])).join("");

    expect(written).not.toContain(HttpFixture.TOKEN);
  });
});
