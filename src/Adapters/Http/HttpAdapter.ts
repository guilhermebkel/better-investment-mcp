import { HttpFailureError } from "@/Errors/HttpFailureError.ts";
import { HttpRefusedError } from "@/Errors/HttpRefusedError.ts";
import type { HttpAttempt, HttpOptions, HttpPort } from "@/Protocols/HttpProtocol.ts";

const TOO_MANY_REQUESTS = 429;
const SERVER_ERROR_MIN = 500;
const REDIRECT_MIN = 300;
const REDIRECT_MAX = 399;
const SUCCESS_MAX = 299;
const BYTES_PER_MIB = 1_048_576;
const MAX_RESPONSE_MIB = 5;

export class HttpAdapter implements HttpPort {
  static readonly DEFAULT_MAX_BYTES = MAX_RESPONSE_MIB * BYTES_PER_MIB;
  static readonly DEFAULT_TIMEOUT_MS = 20_000;
  static readonly DEFAULT_RETRY_DELAY_MS = 1000;
  // Why: every request names this client, so a vendor can see who calls it and contact the owner; it never imitates another client.
  static readonly USER_AGENT = "better-investment-analysis-mcp (+https://github.com/guilhermebkel/better-investment-analysis-mcp)";

  private readonly allowedHosts: ReadonlySet<string>;
  private readonly maxBytes: number;
  private readonly timeoutMs: number;
  private readonly retryDelayMs: number;

  constructor(options: HttpOptions) {
    this.allowedHosts = new Set(options.allowedHosts);
    this.maxBytes = options.maxBytes ?? HttpAdapter.DEFAULT_MAX_BYTES;
    this.timeoutMs = options.timeoutMs ?? HttpAdapter.DEFAULT_TIMEOUT_MS;
    this.retryDelayMs = options.retryDelayMs ?? HttpAdapter.DEFAULT_RETRY_DELAY_MS;
  }

  async getText(url: string, encoding = "utf-8"): Promise<string> {
    const bytes = await this.getBytes(url);
    return new TextDecoder(encoding).decode(bytes);
  }

  async postForm(url: string, fieldToValue: Readonly<Record<string, string>>): Promise<string> {
    const body = new FormData();
    for (const [name, value] of Object.entries(fieldToValue)) {
      body.append(name, value);
    }
    const bytes = await this.request(url, { method: "POST", body });
    return new TextDecoder("utf-8").decode(bytes);
  }

  async getBytes(url: string): Promise<Uint8Array> {
    return this.request(url, { method: "GET" });
  }

  private async request(url: string, init: {
    method: string; body?: FormData;
  }): Promise<Uint8Array> {
    // Why: a host outside the adapter's list is refused before any connection, so no request reaches a host the adapter did not declare.
    this.checkHost(url);
    const first = await this.fetchOnce(url, init);
    if (first.isAnswered) {
      return first.bytes;
    }
    await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
    const second = await this.fetchOnce(url, init);
    if (second.isAnswered) {
      return second.bytes;
    }
    throw new HttpFailureError(second.reason, second.status);
  }

  private checkHost(url: string): void {
    const host = new URL(url).hostname;
    if (!this.allowedHosts.has(host)) {
      throw new HttpRefusedError(`${host} is not in the host list of this adapter`);
    }
  }

  private async fetchOnce(url: string, init: {
    method: string; body?: FormData;
  }): Promise<HttpAttempt> {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        redirect: "manual",
        headers: { "User-Agent": HttpAdapter.USER_AGENT },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown error";
      return { isAnswered: false, reason: `the request failed: ${detail}` };
    }
    if (response.status >= REDIRECT_MIN && response.status <= REDIRECT_MAX) {
      throw new HttpRefusedError("the vendor redirected the request, and redirects are not followed");
    }
    if (response.status === TOO_MANY_REQUESTS) {
      return { isAnswered: false, reason: "the vendor answered with a rate limit (status 429)", status: response.status };
    }
    if (response.status >= SERVER_ERROR_MIN) {
      return { isAnswered: false, reason: `the vendor answered with status ${response.status}`, status: response.status };
    }
    if (response.status > SUCCESS_MAX) {
      throw new HttpFailureError(`the vendor answered with status ${response.status}`, response.status);
    }
    return { isAnswered: true, bytes: await this.readBody(response) };
  }

  private async readBody(response: Response): Promise<Uint8Array> {
    const declared = Number(response.headers.get("content-length") ?? Number.NaN);
    if (declared > this.maxBytes) {
      throw new HttpRefusedError(`the response is larger than ${this.maxBytes} bytes`);
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (response.body !== null) {
      const body: AsyncIterable<Uint8Array> = response.body;
      for await (const chunk of body) {
        total += chunk.byteLength;
        if (total > this.maxBytes) {
          throw new HttpRefusedError(`the response is larger than ${this.maxBytes} bytes`);
        }
        chunks.push(chunk);
      }
    }
    return Buffer.concat(chunks);
  }
}
