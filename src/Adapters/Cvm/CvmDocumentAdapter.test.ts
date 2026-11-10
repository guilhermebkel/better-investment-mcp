import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import { CvmDocumentAdapter } from "@/Adapters/Cvm/CvmDocumentAdapter.ts";
import { HttpRefusedError } from "@/Errors/HttpRefusedError.ts";

const PDF_TEXT = "%PDF-1.4\n%%EOF\n";
const HTML_PAGE_TEXT = "<html>ENET Download de Documento</html>";
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

const buildHttpAnswering = (answer: (url: string) => Promise<Uint8Array>): HttpPort => ({
  getText: () => Promise.reject(new Error("not used")),
  downloadToFile: () => Promise.reject(new Error("not used")),
  getCookies: () => Promise.reject(new Error("not used")),
  postForm: () => Promise.reject(new Error("not used")),
  getBytes: answer,
});

describe("CvmDocumentAdapter.fetchDocument()", () => {
  it("downloads the document link through the HTTP port", async () => {
    const pdf = new TextEncoder().encode(PDF_TEXT);
    const { http, requested } = buildHttp(pdf);

    const bytes = await new CvmDocumentAdapter(http).fetchDocument(DOCUMENT_URL);

    expect(bytes).toStrictEqual(pdf);
    expect(requested).toStrictEqual([DOCUMENT_URL]);
  });

  it("returns the document as plain bytes, not as a Node Buffer, which the PDF reader refuses", async () => {
    const pdf = new TextEncoder().encode(PDF_TEXT);
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

    await expect(new CvmDocumentAdapter(http, () => Promise.resolve()).fetchDocument(DOCUMENT_URL)).rejects.toThrow("the CVM link answered with a web page, not the document");
  });

  it("tries the link again after an HTML page, and returns the document of the next answer", async () => {
    const pdf = new TextEncoder().encode(PDF_TEXT);
    const html = new TextEncoder().encode(HTML_PAGE_TEXT);
    const answers = [html, pdf];
    const waits: number[] = [];
    const requested: string[] = [];
    const http = buildHttpAnswering(() => {
      requested.push(DOCUMENT_URL);
      return Promise.resolve(answers.shift() ?? html);
    });

    const recordWait = (ms: number): Promise<void> => {
      waits.push(ms);
      return Promise.resolve();
    };
    const bytes = await new CvmDocumentAdapter(http, recordWait).fetchDocument(DOCUMENT_URL);

    expect(bytes).toStrictEqual(pdf);
    expect(requested).toHaveLength(2);
    expect(waits).toStrictEqual([2_000]);
  });

  it("gives up after the last attempt, with the wait of each attempt in order", async () => {
    const html = new TextEncoder().encode(HTML_PAGE_TEXT);
    const waits: number[] = [];
    const requested: string[] = [];
    const http = buildHttpAnswering(() => {
      requested.push(DOCUMENT_URL);
      return Promise.resolve(html);
    });

    const recordWait = (ms: number): Promise<void> => {
      waits.push(ms);
      return Promise.resolve();
    };

    await expect(new CvmDocumentAdapter(http, recordWait).fetchDocument(DOCUMENT_URL)).rejects.toThrow("the CVM link answered with a web page");
    expect(requested).toHaveLength(CvmDocumentAdapter.DOCUMENT_ATTEMPTS);
    expect(waits).toStrictEqual([2_000, 4_000, 8_000]);
  });

  it("does not try again a document over the size limit", async () => {
    const requested: string[] = [];
    const http = buildHttpAnswering(() => {
      requested.push(DOCUMENT_URL);
      return Promise.reject(new HttpRefusedError("the response is larger than 104857600 bytes"));
    });

    await expect(new CvmDocumentAdapter(http, () => Promise.resolve()).fetchDocument(DOCUMENT_URL)).rejects.toThrow("larger than");
    expect(requested).toHaveLength(1);
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
