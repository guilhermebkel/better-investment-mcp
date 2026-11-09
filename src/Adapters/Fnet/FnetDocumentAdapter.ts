import type { DocumentProvider } from "@/Protocols/DocumentProviderProtocol.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";

const BYTES_PER_MIB = 1_048_576;
const PDF_SIGNATURE = "%PDF";
const MAX_DOCUMENT_MIB = 20;
const READABLE_PROTOCOLS: readonly ("http:" | "https:")[] = ["https:", "http:"];

export class FnetDocumentAdapter implements DocumentProvider {
  static readonly VENDOR = "fnet";
  static readonly MAX_DOCUMENT_BYTES = MAX_DOCUMENT_MIB * BYTES_PER_MIB;
  static readonly TIMEOUT_MS = 60_000;
  static readonly MARKETS: readonly "BR"[] = ["BR"];
  static readonly ASSET_TYPES: readonly "fii"[] = ["fii"];

  readonly category = "documents";
  readonly vendor = FnetDocumentAdapter.VENDOR;
  readonly markets = FnetDocumentAdapter.MARKETS;
  readonly assetTypes = FnetDocumentAdapter.ASSET_TYPES;

  private readonly http: HttpPort;

  constructor(http: HttpPort) {
    this.http = http;
  }

  async fetchDocument(url: string): Promise<Uint8Array> {
    // Why: the link is taken as the filing names it, on any http or https host; the URL is not printed in an error, because a link can carry a token.
    FnetDocumentAdapter.checkReadableUrl(url);
    const bytes = await this.http.getBytes(url);
    if (!FnetDocumentAdapter.isPdf(bytes)) {
      throw new Error("FNET answered with a page, not a PDF document; no document was stored");
    }
    return new Uint8Array(bytes);
  }

  private static checkReadableUrl(rawUrl: string): void {
    const parsed = URL.parse(rawUrl);
    if (parsed === null) {
      throw new Error("the filing link is not a valid URL; no document was read");
    }
    if (!READABLE_PROTOCOLS.some((protocol) => protocol === parsed.protocol)) {
      throw new Error("the filing link is not an http or https address; no document was read");
    }
  }

  private static isPdf(bytes: Uint8Array): boolean {
    return new TextDecoder("latin1").decode(bytes.subarray(0, PDF_SIGNATURE.length)) === PDF_SIGNATURE;
  }
}
