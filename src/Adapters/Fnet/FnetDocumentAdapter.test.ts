import { describe, expect, it } from "vitest";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import { FnetDocumentAdapter } from "@/Adapters/Fnet/FnetDocumentAdapter.ts";

const EXIBIR_URL = "https://fnet.bmfbovespa.com.br/fnet/publico/exibirDocumento?id=1348097&cvm=true";
const DOWNLOAD_URL = "https://fnet.bmfbovespa.com.br/fnet/publico/downloadDocumento?id=1348097";
const SCHEME_ERROR_MESSAGE = "the filing link is not an http or https address";

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

describe("FnetDocumentAdapter.fetchDocument()", () => {
  it("downloads the document via exibirDocumento and returns original bytes when valid PDF", async () => {
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

  it("refuses an answer that is HTML instead of PDF without storing", async () => {
    const html = new TextEncoder().encode("<!DOCTYPE html><html><body>Erro 520</body></html>");
    const { http } = buildHttp(html);

    await expect(new FnetDocumentAdapter(http).fetchDocument(EXIBIR_URL))
      .rejects.toThrow("FNET answered with a page, not a PDF document; no document was stored");
  });

  it("reads a link on any http or https host, as the filing names it", async () => {
    const pdf = new TextEncoder().encode("%PDF-1.7\n%%EOF\n");
    const { http, requested } = buildHttp(pdf);

    await new FnetDocumentAdapter(http).fetchDocument("http://example.org/doc.pdf");

    expect(requested).toStrictEqual(["http://example.org/doc.pdf"]);
  });

  it("refuses a link that is not an http or https address, without performing requests", async () => {
    const { http, requested } = buildHttp(new Uint8Array());

    await expect(new FnetDocumentAdapter(http).fetchDocument("file:///etc/passwd")).rejects.toThrow(SCHEME_ERROR_MESSAGE);
    expect(requested).toStrictEqual([]);
  });

  it("does not print a link that is not a valid URL, because it can carry a secret", async () => {
    const { http, requested } = buildHttp(new Uint8Array());
    const fakeSecret = "fake-query-secret-789";

    let caught: Error | undefined;
    await new FnetDocumentAdapter(http).fetchDocument(`not a url token=${fakeSecret}`).catch((error: unknown) => {
      caught = error as Error;
    });

    expect(caught?.message).toBe("the filing link is not a valid URL; no document was read");
    expect(caught?.message).not.toContain(fakeSecret);
    expect(requested).toStrictEqual([]);
  });
});
