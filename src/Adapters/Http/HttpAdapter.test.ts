import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HttpAdapter } from "@/Adapters/Http/HttpAdapter.ts";
import { HttpFailureError } from "@/Errors/HttpFailureError.ts";
import { HttpRefusedError } from "@/Errors/HttpRefusedError.ts";

const SMALL_LIMIT_BYTES = 1000;
const OVER_LIMIT_MESSAGE = "larger than 1000 bytes";
const UNAVAILABLE_PATH = "/unavailable";
const UNAVAILABLE_ONCE_PATH = "/unavailable-once";

describe("HttpAdapter.getText()", () => {
  const pathToCount = new Map<string, number>();
  const pathToHandler = new Map<string, (response: ServerResponse) => void>([
    ["/ok", (response) => {
      response.writeHead(200, { "content-type": "text/plain" }).end("hello");
    }],
    ["/big-declared", (response) => {
      response.writeHead(200, { "content-length": String(SMALL_LIMIT_BYTES + 1) }).end("x".repeat(SMALL_LIMIT_BYTES + 1));
    }],
    ["/big-chunked", (response) => {
      response.writeHead(200);
      response.write("x".repeat(SMALL_LIMIT_BYTES));
      response.end("x".repeat(10));
    }],
    ["/redirect", (response) => {
      response.writeHead(302, { location: "http://elsewhere.invalid/" }).end();
    }],
    [UNAVAILABLE_ONCE_PATH, (response) => {
      if ((pathToCount.get(UNAVAILABLE_ONCE_PATH) ?? 0) === 1) {
        response.writeHead(503).end();
        return;
      }
      response.writeHead(200).end("back");
    }],
    [UNAVAILABLE_PATH, (response) => {
      response.writeHead(503).end();
    }],
    ["/not-found", (response) => {
      response.writeHead(404).end();
    }],
  ]);
  let server: Server;
  let origin: string;

  beforeEach(async () => {
    pathToCount.clear();
    server = createServer((request: IncomingMessage, response: ServerResponse) => {
      const path = request.url ?? "";
      pathToCount.set(path, (pathToCount.get(path) ?? 0) + 1);
      const handle = pathToHandler.get(path);
      if (handle === undefined) {
        response.writeHead(404).end();
        return;
      }
      handle(response);
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        resolve();
      });
    });
    const { port } = server.address() as AddressInfo;
    origin = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  const buildAdapter = (): HttpAdapter => new HttpAdapter({ allowedHosts: ["127.0.0.1"], maxBytes: SMALL_LIMIT_BYTES, retryDelayMs: 0 });

  describe("when the host is not in the adapter's list", () => {
    it("refuses before any connection is made", async () => {
      await expect(buildAdapter().getText("https://example.invalid/data")).rejects.toThrow(HttpRefusedError);
      await expect(buildAdapter().getText("https://example.invalid/data")).rejects.toThrow("example.invalid is not in the host list");
    });
  });

  describe("when the vendor answers within the size limit", () => {
    it("returns the body", async () => {
      expect(await buildAdapter().getText(`${origin}/ok`)).toBe("hello");
    });
  });

  describe("when the response declares a body above the size limit", () => {
    it("refuses it", async () => {
      await expect(buildAdapter().getText(`${origin}/big-declared`)).rejects.toThrow(HttpRefusedError);
    });
  });

  describe("when a chunked response grows above the size limit", () => {
    it("stops reading and refuses it", async () => {
      await expect(buildAdapter().getText(`${origin}/big-chunked`)).rejects.toThrow(OVER_LIMIT_MESSAGE);
    });
  });

  describe("when the vendor redirects", () => {
    it("refuses, because redirects are not followed to another host", async () => {
      await expect(buildAdapter().getText(`${origin}/redirect`)).rejects.toThrow("redirects are not followed");
    });
  });

  describe("when the vendor fails once with a temporary error", () => {
    it("retries once and returns the answer of the retry", async () => {
      expect(await buildAdapter().getText(`${origin}${UNAVAILABLE_ONCE_PATH}`)).toBe("back");
      expect(pathToCount.get(UNAVAILABLE_ONCE_PATH)).toBe(2);
    });
  });

  describe("when the vendor keeps failing with a temporary error", () => {
    it("tries twice and reports the failure", async () => {
      await expect(buildAdapter().getText(`${origin}${UNAVAILABLE_PATH}`)).rejects.toThrow(HttpFailureError);
      expect(pathToCount.get(UNAVAILABLE_PATH)).toBe(2);
    });
  });

  describe("when the vendor answers with a permanent error", () => {
    it("does not retry", async () => {
      await expect(buildAdapter().getText(`${origin}/not-found`)).rejects.toThrow("status 404");
      expect(pathToCount.get("/not-found")).toBe(1);
    });
  });
});
