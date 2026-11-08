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

  it("refuses an answer that is an HTML page instead of a PDF", async () => {
    const { http } = buildHttp(new TextEncoder().encode("<!DOCTYPE html><html><body>Pagina de erro</body></html>"));

    await expect(new CvmDocumentAdapter(http).fetchDocument(DOCUMENT_URL)).rejects.toThrow("CVM answered with a page, not a PDF document");
  });

  it("refuses a link that is not on the CVM document host, and asks for nothing", async () => {
    const { http, requested } = buildHttp(new Uint8Array());

    await expect(new CvmDocumentAdapter(http).fetchDocument("https://example.org/doc.pdf")).rejects.toThrow("not a CVM document link");
    expect(requested).toStrictEqual([]);
  });
});
