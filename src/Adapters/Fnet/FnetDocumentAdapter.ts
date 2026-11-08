import type { DocumentProvider } from "@/Protocols/DocumentProviderProtocol.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";

const BYTES_PER_MIB = 1_048_576;
const PDF_SIGNATURE = "%PDF";
const MAX_DOCUMENT_MIB = 20;

export class FnetDocumentAdapter implements DocumentProvider {
  static readonly VENDOR = "fnet";
  static readonly HOST = "fnet.bmfbovespa.com.br";
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
    const isExibir = url.startsWith(`https://${FnetDocumentAdapter.HOST}/fnet/publico/exibirDocumento?id=`);
    const isDownload = url.startsWith(`https://${FnetDocumentAdapter.HOST}/fnet/publico/downloadDocumento?id=`);
    if (!isExibir && !isDownload) {
      throw new Error(`the filing link is not an allowed FNET document link on ${FnetDocumentAdapter.HOST}; no document was read`);
    }
    const bytes = await this.http.getBytes(url);
    if (!FnetDocumentAdapter.isPdf(bytes)) {
      throw new Error("FNET answered with a page, not a PDF document; no document was stored");
    }
    return bytes;
  }

  private static isPdf(bytes: Uint8Array): boolean {
    return new TextDecoder("latin1").decode(bytes.subarray(0, PDF_SIGNATURE.length)) === PDF_SIGNATURE;
  }
}
