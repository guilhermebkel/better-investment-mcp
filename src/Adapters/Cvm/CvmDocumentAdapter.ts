import type { DocumentProvider } from "@/Protocols/DocumentProviderProtocol.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import { ZipFileUtil } from "@/Utils/ZipFileUtil.ts";

const BYTES_PER_MIB = 1_048_576;
const PDF_SIGNATURE = "%PDF";
const READABLE_PROTOCOLS: readonly ("http:" | "https:")[] = ["https:", "http:"];
const MAX_DOCUMENT_MIB = 20;

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

  private readonly http: HttpPort;

  constructor(http: HttpPort) {
    this.http = http;
  }

  async fetchDocument(url: string): Promise<Uint8Array> {
    if (!CvmDocumentAdapter.isDocumentLink(url)) {
      throw new Error("the filing link is not an http or https address; no document was read");
    }
    // Why: the HTTP adapter checks the host and the size; a refused document leaves nothing in the store because the caller writes only after a download succeeds.
    const bytes = await this.http.getBytes(url);
    // Why: the CVM site sometimes answers 200 with an HTML error page instead of the filing; that page is not a document, so it is refused before any text is read from it. A reference form is a zip of XML and PDFs.
    if (!CvmDocumentAdapter.isPdf(bytes) && !ZipFileUtil.isZip(bytes)) {
      throw new Error("CVM answered with a page, not a PDF document or a form zip; no document was stored");
    }
    // Why: the HTTP adapter answers with a Node Buffer, which the PDF reader refuses; the document leaves the adapter as plain bytes.
    return new Uint8Array(bytes);
  }

  static isDocumentLink(url: string): boolean {
    const parsed = URL.parse(url);
    return parsed !== null && READABLE_PROTOCOLS.some((protocol) => protocol === parsed.protocol);
  }

  private static isPdf(bytes: Uint8Array): boolean {
    return new TextDecoder("latin1").decode(bytes.subarray(0, PDF_SIGNATURE.length)) === PDF_SIGNATURE;
  }
}
