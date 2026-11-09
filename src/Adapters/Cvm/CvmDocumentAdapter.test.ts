import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import { CvmDocumentAdapter } from "@/Adapters/Cvm/CvmDocumentAdapter.ts";

const DOCUMENT_URL = "https://www.rad.cvm.gov.br/ENET/frmDownloadDocumento.aspx?Tela=ext&numProtocolo=1&numSequencia=2&numVersao=1";

type FakeHttp = {
  http: HttpPort;
  requested: string[];
};

const buildHttp = (bytes: Uint8Array): FakeHttp => {
  const requested: string[] = [];
  const http: HttpPort = {
    getText: () => Promise.reject(new Error("not used")),
    downloadToFile: () => Promise.reject(new Error("not used")),
    getCookies: () => Promise.reject(new Error("not used")),
    postForm: () => Promise.reject(new Error("not used")),
    getBytes: (url: string) => {
      requested.push(url);
      return Promise.resolve(bytes);
    },
  };
  return { http, requested };
};

describe("CvmDocumentAdapter.fetchDocument()", () => {
  it("downloads the document link through the HTTP port", async () => {
    const pdf = new TextEncoder().encode("%PDF-1.4\n%%EOF\n");
    const { http, requested } = buildHttp(pdf);

    const bytes = await new CvmDocumentAdapter(http).fetchDocument(DOCUMENT_URL);

    expect(bytes).toStrictEqual(pdf);
    expect(requested).toStrictEqual([DOCUMENT_URL]);
  });

  it("returns the document as plain bytes, not as a Node Buffer, which the PDF reader refuses", async () => {
    const pdf = new TextEncoder().encode("%PDF-1.4\n%%EOF\n");
    const { http } = buildHttp(Buffer.from(pdf));

    const bytes = await new CvmDocumentAdapter(http).fetchDocument(DOCUMENT_URL);

    expect(Buffer.isBuffer(bytes)).toBe(false);
    expect(bytes).toStrictEqual(pdf);
  });

  it("accepts a reference form zip as it is, the same way (FRE)", async () => {
    const fixture = join(import.meta.dirname, "..", "..", "Testing", "fixtures", "fre", "form-sample.zip");
    const zip = new Uint8Array(readFileSync(fixture));
    const { http } = buildHttp(Buffer.from(zip));

    const bytes = await new CvmDocumentAdapter(http).fetchDocument(DOCUMENT_URL);

    expect(bytes).toStrictEqual(zip);
  });

  it("refuses an answer that is an HTML page instead of a PDF", async () => {
    const { http } = buildHttp(new TextEncoder().encode("<!DOCTYPE html><html><body>Pagina de erro</body></html>"));

    await expect(new CvmDocumentAdapter(http).fetchDocument(DOCUMENT_URL)).rejects.toThrow("the CVM link answered with a web page, not the document");
  });

  it("downloads a report that CVM indexes through its FNET link, the same way (P5)", async () => {
    const pdf = new TextEncoder().encode("%PDF-1.7\n%%EOF\n");
    const { http, requested } = buildHttp(pdf);
    const fnetUrl = "https://fnet.bmfbovespa.com.br/fnet/publico/downloadDocumento?id=1035283";

    const bytes = await new CvmDocumentAdapter(http).fetchDocument(fnetUrl);

    expect(bytes).toStrictEqual(pdf);
    expect(requested).toStrictEqual([fnetUrl]);
  });

  it("reads a link on any http or https host, as the filing names it", async () => {
    const pdf = new TextEncoder().encode("%PDF-1.7\n%%EOF\n");
    const { http, requested } = buildHttp(pdf);

    await new CvmDocumentAdapter(http).fetchDocument("http://example.org/doc.pdf");

    expect(requested).toStrictEqual(["http://example.org/doc.pdf"]);
  });

  it("refuses a link that is not an http or https address, and asks for nothing", async () => {
    const { http, requested } = buildHttp(new Uint8Array());

    await expect(new CvmDocumentAdapter(http).fetchDocument("file:///etc/passwd")).rejects.toThrow("not an http or https address");
    expect(requested).toStrictEqual([]);
  });
});
