import { describe, expect, it } from "vitest";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import { FnetDocumentAdapter } from "@/Adapters/Fnet/FnetDocumentAdapter.ts";

const EXIBIR_URL = "https://fnet.bmfbovespa.com.br/fnet/publico/exibirDocumento?id=1348097&cvm=true";
const DOWNLOAD_URL = "https://fnet.bmfbovespa.com.br/fnet/publico/downloadDocumento?id=1348097";
const NOT_ALLOWED_MESSAGE = "not an allowed FNET document link on fnet.bmfbovespa.com.br";

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

describe("FnetDocumentAdapter.fetchDocument()", () => {
  it("downloads the document via exibirDocumento and returns original bytes when valid PDF (AC3)", async () => {
    const pdf = new TextEncoder().encode("%PDF-1.4\n%%EOF\n");
    const { http, requested } = buildHttp(pdf);

    const bytes = await new FnetDocumentAdapter(http).fetchDocument(EXIBIR_URL);

    expect(bytes).toStrictEqual(pdf);
    expect(requested).toStrictEqual([EXIBIR_URL]);
  });

  it("downloads the document via downloadDocumento when valid PDF", async () => {
    const pdf = new TextEncoder().encode("%PDF-1.4\n%%EOF\n");
    const { http, requested } = buildHttp(pdf);

    const bytes = await new FnetDocumentAdapter(http).fetchDocument(DOWNLOAD_URL);

    expect(bytes).toStrictEqual(pdf);
    expect(requested).toStrictEqual([DOWNLOAD_URL]);
  });

  it("refuses an answer that is HTML instead of PDF without storing (AC3)", async () => {
    const html = new TextEncoder().encode("<!DOCTYPE html><html><body>Erro 520</body></html>");
    const { http } = buildHttp(html);

    await expect(new FnetDocumentAdapter(http).fetchDocument(EXIBIR_URL))
      .rejects.toThrow("FNET answered with a page, not a PDF document; no document was stored");
  });

  it("refuses links not on fnet.bmfbovespa.com.br and performs zero HTTP requests (AC3)", async () => {
    const { http, requested } = buildHttp(new Uint8Array());

    await expect(new FnetDocumentAdapter(http).fetchDocument("https://example.org/doc.pdf"))
      .rejects.toThrow(NOT_ALLOWED_MESSAGE);
    expect(requested).toStrictEqual([]);
  });

  it("refuses plain HTTP links on the host without performing requests", async () => {
    const { http, requested } = buildHttp(new Uint8Array());

    await expect(new FnetDocumentAdapter(http).fetchDocument("http://fnet.bmfbovespa.com.br/fnet/publico/exibirDocumento?id=123"))
      .rejects.toThrow(NOT_ALLOWED_MESSAGE);
    expect(requested).toStrictEqual([]);
  });

  it("refuses unauthorized paths on fnet.bmfbovespa.com.br", async () => {
    const { http, requested } = buildHttp(new Uint8Array());

    await expect(new FnetDocumentAdapter(http).fetchDocument("https://fnet.bmfbovespa.com.br/fnet/publico/outraCoisa"))
      .rejects.toThrow(NOT_ALLOWED_MESSAGE);
    expect(requested).toStrictEqual([]);
  });
});
