import type { DocumentProvider } from "@/Protocols/DocumentProviderProtocol.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";

const BYTES_PER_MIB = 1_048_576;
const PDF_SIGNATURE = "%PDF";
const MAX_DOCUMENT_MIB = 20;
const POSITIVE_INTEGER = /^[1-9]\d*$/u;

export class FnetDocumentAdapter implements DocumentProvider {
  static readonly VENDOR = "fnet";
  static readonly HOST = "fnet.bmfbovespa.com.br";
  static readonly MAX_DOCUMENT_BYTES = MAX_DOCUMENT_MIB * BYTES_PER_MIB;
  static readonly TIMEOUT_MS = 60_000;
  static readonly MARKETS: readonly "BR"[] = ["BR"];
  static readonly ASSET_TYPES: readonly "fii"[] = ["fii"];

  static readonly EXHIBIR_PATH = "/fnet/publico/exibirDocumento";
  static readonly DOWNLOAD_PATH = "/fnet/publico/downloadDocumento";

  readonly category = "documents";
  readonly vendor = FnetDocumentAdapter.VENDOR;
  readonly markets = FnetDocumentAdapter.MARKETS;
  readonly assetTypes = FnetDocumentAdapter.ASSET_TYPES;

  private readonly http: HttpPort;

  constructor(http: HttpPort) {
    this.http = http;
  }

  async fetchDocument(url: string): Promise<Uint8Array> {
    FnetDocumentAdapter.validateUrl(url);
    const bytes = await this.http.getBytes(url);
    if (!FnetDocumentAdapter.isPdf(bytes)) {
      throw new Error("FNET answered with a page, not a PDF document; no document was stored");
    }
    return new Uint8Array(bytes);
  }

  static validateUrl(rawUrl: string): URL {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new Error("the filing link is not a valid URL for FNET; no document was read");
    }
    if (parsed.protocol !== "https:") {
      throw new Error(`the filing link must use HTTPS on ${FnetDocumentAdapter.HOST}; no document was read`);
    }
    if (parsed.hostname !== FnetDocumentAdapter.HOST) {
      throw new Error(`the filing link is not on ${FnetDocumentAdapter.HOST}; no document was read`);
    }
    if (parsed.port !== "") {
      throw new Error("the filing link specifies an unexpected port for FNET; no document was read");
    }
    if (parsed.username !== "" || parsed.password !== "") {
      throw new Error("the filing link contains credentials for FNET; no document was read");
    }
    if (!FnetDocumentAdapter.isAllowedPath(parsed.pathname)) {
      throw new Error(`the filing link path is not allowed on ${FnetDocumentAdapter.HOST}; no document was read`);
    }
    const documentId = parsed.searchParams.get("id");
    if (documentId === null || !POSITIVE_INTEGER.test(documentId)) {
      throw new Error("the filing link has an invalid or missing document id for FNET; no document was read");
    }
    return parsed;
  }

  private static isAllowedPath(path: string): boolean {
    return path === FnetDocumentAdapter.EXHIBIR_PATH || path === FnetDocumentAdapter.DOWNLOAD_PATH;
  }

  private static isPdf(bytes: Uint8Array): boolean {
    return new TextDecoder("latin1").decode(bytes.subarray(0, PDF_SIGNATURE.length)) === PDF_SIGNATURE;
  }
}
