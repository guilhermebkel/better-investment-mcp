import { HttpRefusedError } from "@/Errors/HttpRefusedError.ts";
import type { DocumentProvider } from "@/Protocols/DocumentProviderProtocol.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import { LogUtil } from "@/Utils/LogUtil.ts";
import { ZipFileUtil } from "@/Utils/ZipFileUtil.ts";

const BYTES_PER_MIB = 1_048_576;
const PDF_SIGNATURE = "%PDF";
const READABLE_PROTOCOLS: readonly ("http:" | "https:")[] = ["https:", "http:"];
const MAX_DOCUMENT_MIB = 100;
const FIRST_RETRY_WAIT_MS = 2_000;
const SECOND_RETRY_WAIT_MS = 4_000;
const THIRD_RETRY_WAIT_MS = 8_000;

export class CvmDocumentAdapter implements DocumentProvider {
  static readonly VENDOR = "cvm";
  static readonly HOST = "www.rad.cvm.gov.br";
  // Why: the eventual fund file links each FII report to FNET, which hosts the PDF; CVM indexes the link, so the origin stays CVM and the host is recorded apart (issue #28, P5).
  static readonly FNET_HOST = "fnet.bmfbovespa.com.br";
  // Why: a filing (a PDF of a reference form or a quarterly report) can be several megabytes; this limit is explicit for documents only, and the HTTP adapter refuses anything above it before storing.
  static readonly MAX_DOCUMENT_BYTES = MAX_DOCUMENT_MIB * BYTES_PER_MIB;
  // Why: a large filing takes longer than the default 20 seconds to arrive.
  static readonly TIMEOUT_MS = 60_000;
  static readonly MARKETS: readonly "BR"[] = ["BR"];
  static readonly ASSET_TYPES: readonly ("stock" | "fii" | "etf")[] = ["stock", "fii", "etf"];

  readonly category = "documents";
  readonly vendor = CvmDocumentAdapter.VENDOR;
  readonly markets = CvmDocumentAdapter.MARKETS;
  readonly assetTypes = CvmDocumentAdapter.ASSET_TYPES;

  // Why: the CVM link answers with an HTML page, a cut transfer or a timeout for the same link at different times; a download is tried again after a wait before it counts as a failure.
  static readonly DOCUMENT_ATTEMPTS = 4;
  static readonly RETRY_WAITS_MS: readonly number[] = [FIRST_RETRY_WAIT_MS, SECOND_RETRY_WAIT_MS, THIRD_RETRY_WAIT_MS];

  private readonly http: HttpPort;
  private readonly pause: (ms: number) => Promise<void>;

  constructor(http: HttpPort, pause: (ms: number) => Promise<void> = (ms: number) => CvmDocumentAdapter.sleep(ms)) {
    this.http = http;
    this.pause = pause;
  }

  async fetchDocument(url: string): Promise<Uint8Array> {
    if (!CvmDocumentAdapter.isDocumentLink(url)) {
      throw new Error("the filing link is not an http or https address; no document was read");
    }
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.downloadOnce(url);
      } catch (error) {
        const isLastAttempt = attempt >= CvmDocumentAdapter.DOCUMENT_ATTEMPTS;
        // Why: a document over the size limit is refused by the HTTP adapter for good; another try would download it again for nothing.
        if (error instanceof HttpRefusedError || isLastAttempt) {
          throw error;
        }
        // Why: a failed attempt that is tried again is a warning; the last failure is reported by the loader as an error.
        LogUtil.logWarn("cvm.document.retry", { attempt, attempts: CvmDocumentAdapter.DOCUMENT_ATTEMPTS, reason: CvmDocumentAdapter.classifyFailure(error) });
        await this.pause(CvmDocumentAdapter.RETRY_WAITS_MS[attempt - 1] ?? 0);
      }
    }
  }

  private async downloadOnce(url: string): Promise<Uint8Array> {
    // Why: the HTTP adapter checks the host and the size; a refused document leaves nothing in the store because the caller writes only after a download succeeds.
    const bytes = await this.http.getBytes(url);
    // Why: the CVM site sometimes answers 200 with an HTML error page instead of the filing; that page is not a document, so it is refused before any text is read from it. A reference form is a zip of XML and PDFs.
    if (!CvmDocumentAdapter.isPdf(bytes) && !ZipFileUtil.isZip(bytes)) {
      throw new Error(`the CVM link answered with a web page, not the document (a PDF or a form zip), so it was not read; the CVM site does this at times, so try the query again later. Link: ${url}`);
    }
    // Why: the HTTP adapter answers with a Node Buffer, which the PDF reader refuses; the document leaves the adapter as plain bytes.
    return new Uint8Array(bytes);
  }

  private static classifyFailure(error: unknown): string {
    // Why: the kind of failure is named without the message, which can hold the link; the kinds are the ones this site shows.
    const message = error instanceof Error ? error.message : "";
    if (message.includes("web page")) {
      return "web_page";
    }
    if (message.includes("outstanding read data") || message.includes("terminated")) {
      return "cut_transfer";
    }
    if (message.includes("timed out") || message.includes("aborted")) {
      return "timeout";
    }
    return error instanceof Error ? error.name : "unknown";
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  static isDocumentLink(url: string): boolean {
    const parsed = URL.parse(url);
    return parsed !== null && READABLE_PROTOCOLS.some((protocol) => protocol === parsed.protocol);
  }

  private static isPdf(bytes: Uint8Array): boolean {
    return new TextDecoder("latin1").decode(bytes.subarray(0, PDF_SIGNATURE.length)) === PDF_SIGNATURE;
  }
}
