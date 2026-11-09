import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { HttpBadJsonError } from "@/Errors/HttpBadJsonError.ts";
import { HttpBodyTooLargeError } from "@/Errors/HttpBodyTooLargeError.ts";
import { HttpTokenMissingError } from "@/Errors/HttpTokenMissingError.ts";
import type { Env } from "@/Protocols/EnvProtocol.ts";
import type { HttpContext, HttpServerHandle } from "@/Protocols/HttpRunnerProtocol.ts";
import { DEFAULT_HTTP_HOST, DEFAULT_HTTP_PORT } from "@/Schemas/EnvSchema.ts";
import { HttpAuthService } from "@/Services/HttpAuthService.ts";
import { HttpSessionRunner } from "@/Setup/HttpSessionRunner.ts";
import { McpRuntimeSurface } from "@/Surfaces/McpRuntimeSurface.ts";
import { HttpBodyUtil } from "@/Utils/HttpBodyUtil.ts";
import { LogUtil } from "@/Utils/LogUtil.ts";
import { NetworkBindUtil } from "@/Utils/NetworkBindUtil.ts";

const HEALTH_PATH = "/health";
const MCP_PATH = "/mcp";
const PLAIN_TEXT = "text/plain";
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;
const HTTP_PAYLOAD_TOO_LARGE = 413;
const HTTP_INTERNAL_ERROR = 500;
const MAX_BODY_BYTES = 1_048_576;

export class HttpRunner {
  static async run(env: Env): Promise<void> {
    const handle = await HttpRunner.start(env);
    await new Promise<void>((resolve, reject) => {
      const stop = (): void => {
        handle.close().then(resolve, reject);
      };
      process.once("SIGTERM", stop);
      process.once("SIGINT", stop);
    });
  }

  static async start(env: Env): Promise<HttpServerHandle> {
    // Why: the token is required on every address, because a server without one would answer 401 to every MCP call.
    if (env.INVESTMENT_MCP_HTTP_TOKEN === undefined) {
      throw new HttpTokenMissingError();
    }
    const runtime = await McpRuntimeSurface.open(env);
    const sessions = new HttpSessionRunner(() => runtime.buildMcpServer());
    const context: HttpContext = { auth: new HttpAuthService(env.INVESTMENT_MCP_HTTP_TOKEN), sessions };
    const httpServer = createServer((request, response) => {
      HttpRunner.handleRequest(request, response, context).catch((error: unknown) => {
        LogUtil.logError("http_request_failed", error instanceof Error ? error.name : "unknown");
        if (!response.headersSent) {
          HttpRunner.reply(response, HTTP_INTERNAL_ERROR, "Internal Server Error");
        }
      });
    });
    const host = env.INVESTMENT_MCP_HTTP_HOST ?? DEFAULT_HTTP_HOST;
    const port = await HttpRunner.bindHttpServer(httpServer, host, env.INVESTMENT_MCP_HTTP_PORT ?? DEFAULT_HTTP_PORT);
    LogUtil.logInfo("server_started", { transport: "http", httpHost: host, httpPort: port });
    return {
      url: `http://${NetworkBindUtil.buildUrlHost(host)}:${port}`,
      close: async () => {
        await sessions.closeAll();
        const closed = new Promise<void>((resolve, reject) => {
          httpServer.close((error) => {
            if (error === undefined) {
              resolve();
            } else {
              reject(error);
            }
          });
        });
        httpServer.closeAllConnections();
        await closed;
      },
    };
  }

  private static bindHttpServer(httpServer: Server, host: string, port: number): Promise<number> {
    return new Promise((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(port, host, () => {
        const address = httpServer.address();
        if (address === null || typeof address === "string") {
          reject(new Error("HTTP server did not bind to a port."));
          return;
        }
        resolve(address.port);
      });
    });
  }

  private static async handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
    context: HttpContext,
  ): Promise<void> {
    const { pathname } = new URL(request.url ?? "/", "http://localhost");
    if (request.method === "GET" && pathname === HEALTH_PATH) {
      HttpRunner.reply(response, HTTP_OK, "ok");
      return;
    }
    if (pathname !== MCP_PATH) {
      HttpRunner.reply(response, HTTP_NOT_FOUND, "Not Found");
      return;
    }
    if (!context.auth.verifyRequest(request)) {
      HttpRunner.reply(response, HTTP_UNAUTHORIZED, "Unauthorized");
      return;
    }
    try {
      const parsedBody = await HttpRunner.readParsedBody(request);
      await context.sessions.handleRequest(request, response, parsedBody);
    } catch (error) {
      if (error instanceof HttpBodyTooLargeError) {
        HttpRunner.reply(response, HTTP_PAYLOAD_TOO_LARGE, "Payload Too Large");
        return;
      }
      if (error instanceof HttpBadJsonError) {
        HttpRunner.reply(response, HTTP_BAD_REQUEST, "Bad Request");
        return;
      }
      throw error;
    }
  }

  private static readParsedBody(request: IncomingMessage): Promise<unknown> {
    if (request.method !== "POST") {
      return Promise.resolve(undefined);
    }
    return HttpBodyUtil.readJson(request, MAX_BODY_BYTES);
  }

  private static reply(response: ServerResponse, status: number, body: string): void {
    response.writeHead(status, { "Content-Type": PLAIN_TEXT });
    response.end(body);
  }
}
