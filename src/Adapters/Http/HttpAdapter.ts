import { HttpFailureError } from "@/Errors/HttpFailureError.ts";
import { HttpRefusedError } from "@/Errors/HttpRefusedError.ts";
import { createWriteStream } from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { FieldNameToValue, HeaderNameToValue, HttpAttempt, HttpOptions, HttpPort } from "@/Protocols/HttpProtocol.ts";

const TOO_MANY_REQUESTS = 429;
const UNKNOWN_ERROR = "unknown error";
const SERVER_ERROR_MIN = 500;
const REDIRECT_MIN = 300;
const REDIRECT_MAX = 399;
const SUCCESS_MAX = 299;
const BYTES_PER_MIB = 1_048_576;
const MAX_RESPONSE_MIB = 5;

export class HttpAdapter implements HttpPort {
  static readonly DEFAULT_MAX_BYTES = MAX_RESPONSE_MIB * BYTES_PER_MIB;
  static readonly DEFAULT_TIMEOUT_MS = 20_000;
  static buildOverLimitMessage(maxBytes: number): string {
    return `the response is larger than ${maxBytes} bytes`;
  }

  static readonly DEFAULT_RETRY_DELAY_MS = 1000;
  static readonly USER_AGENT = "PostmanRuntime/7.44.1";

  private readonly allowedHosts: ReadonlySet<string>;
  private readonly isAnyHostAllowed: boolean;
  private readonly headers: HeaderNameToValue;
  private readonly userAgent: string;
  private readonly maxBytes: number;
  private readonly timeoutMs: number;
  private readonly retryDelayMs: number;

  constructor(options: HttpOptions) {
    this.allowedHosts = new Set(options.allowedHosts);
    this.isAnyHostAllowed = options.isAnyHostAllowed ?? false;
    this.headers = options.headers ?? {};
    this.userAgent = options.userAgent ?? HttpAdapter.USER_AGENT;
    this.maxBytes = options.maxBytes ?? HttpAdapter.DEFAULT_MAX_BYTES;
    this.timeoutMs = options.timeoutMs ?? HttpAdapter.DEFAULT_TIMEOUT_MS;
    this.retryDelayMs = options.retryDelayMs ?? HttpAdapter.DEFAULT_RETRY_DELAY_MS;
  }

  async getText(url: string, encoding = "utf-8", requestHeaders: HeaderNameToValue = {}): Promise<string> {
    const bytes = await this.request(url, { method: "GET", headers: requestHeaders });
    return new TextDecoder(encoding).decode(bytes);
  }

  async getCookies(url: string): Promise<string[]> {
    this.checkHost(url);
    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "manual",
        headers: this.buildHeaders({}),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      await response.body?.cancel();
      return response.headers.getSetCookie();
    } catch (error) {
      const detail = error instanceof Error ? error.message : UNKNOWN_ERROR;
      throw new HttpFailureError(`the request failed: ${detail}`);
    }
  }

  async postForm(url: string, fieldToValue: FieldNameToValue): Promise<string> {
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

  async downloadToFile(url: string, filePath: string): Promise<number> {
    // Why: a large file goes to disk in chunks, so only one chunk of it is in memory at a time; the size cap still applies to the bytes written.
    this.checkHost(url);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        redirect: "manual",
        headers: this.buildHeaders({}),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : UNKNOWN_ERROR;
      throw new HttpFailureError(`the request failed: ${detail}`);
    }
    if (response.status >= REDIRECT_MIN && response.status <= REDIRECT_MAX) {
      throw new HttpRefusedError("the vendor redirected the request, and redirects are not followed");
    }
    if (response.status > SUCCESS_MAX || response.body === null) {
      throw new HttpFailureError(`the vendor answered with status ${response.status}`, response.status);
    }
    const declared = Number(response.headers.get("content-length") ?? Number.NaN);
    if (declared > this.maxBytes) {
      throw new HttpRefusedError(HttpAdapter.buildOverLimitMessage(this.maxBytes));
    }
    let total = 0;
    const limit = new Transform({
      transform: (chunk: Buffer, _encoding, done) => {
        total += chunk.byteLength;
        if (total > this.maxBytes) {
          done(new HttpRefusedError(HttpAdapter.buildOverLimitMessage(this.maxBytes)));
          return;
        }
        done(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(response.body), limit, createWriteStream(filePath));
    return total;
  }

  private async request(url: string, init: {
    method: string;
    body?: FormData;
    headers?: HeaderNameToValue;
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
    // Why: a document link is taken as the filing names it, so the host is not checked for that download; the size limit and the timeout still apply.
    if (this.isAnyHostAllowed) {
      return;
    }
    const host = new URL(url).hostname;
    if (!this.allowedHosts.has(host)) {
      throw new HttpRefusedError(`${host} is not in the host list of this adapter`);
    }
  }

  private buildHeaders(requestHeaders: HeaderNameToValue): HeaderNameToValue {
    // Why: the client identity comes first; an adapter's own headers come after it and never replace it.
    return { "User-Agent": this.userAgent, ...this.headers, ...requestHeaders };
  }

  private async fetchOnce(url: string, init: {
    method: string;
    body?: FormData;
    headers?: HeaderNameToValue;
  }): Promise<HttpAttempt> {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        redirect: "manual",
        headers: this.buildHeaders(init.headers ?? {}),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : UNKNOWN_ERROR;
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
      throw new HttpRefusedError(HttpAdapter.buildOverLimitMessage(this.maxBytes));
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (response.body !== null) {
      const body: AsyncIterable<Uint8Array> = response.body;
      for await (const chunk of body) {
        total += chunk.byteLength;
        if (total > this.maxBytes) {
          throw new HttpRefusedError(HttpAdapter.buildOverLimitMessage(this.maxBytes));
        }
        chunks.push(chunk);
      }
    }
    return Buffer.concat(chunks);
  }
}
