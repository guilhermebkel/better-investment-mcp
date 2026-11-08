import { describe, expect, it } from "vitest";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import { FnetDocumentAdapter } from "@/Adapters/Fnet/FnetDocumentAdapter.ts";
import { RedactUtil } from "@/Utils/RedactUtil.ts";

const EXIBIR_URL = "https://fnet.bmfbovespa.com.br/fnet/publico/exibirDocumento?id=1348097&cvm=true";
const DOWNLOAD_URL = "https://fnet.bmfbovespa.com.br/fnet/publico/downloadDocumento?id=1348097";
const HOST_ERROR_MESSAGE = "the filing link is not on fnet.bmfbovespa.com.br";
const PATH_ERROR_MESSAGE = "the filing link path is not allowed on fnet.bmfbovespa.com.br";
const ID_ERROR_MESSAGE = "the filing link has an invalid or missing document id";

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

  it("refuses plain HTTP links on the host without performing requests", async () => {
    const { http, requested } = buildHttp(new Uint8Array());

    await expect(new FnetDocumentAdapter(http).fetchDocument("http://fnet.bmfbovespa.com.br/fnet/publico/exibirDocumento?id=123"))
      .rejects.toThrow("the filing link must use HTTPS on fnet.bmfbovespa.com.br");
    expect(requested).toStrictEqual([]);
  });

  it("refuses confusing or external hostnames without performing requests", async () => {
    const { http, requested } = buildHttp(new Uint8Array());

    await expect(new FnetDocumentAdapter(http).fetchDocument("https://fnet.bmfbovespa.com.br.attacker.com/fnet/publico/exibirDocumento?id=123"))
      .rejects.toThrow(HOST_ERROR_MESSAGE);
    await expect(new FnetDocumentAdapter(http).fetchDocument("https://example.org/doc.pdf"))
      .rejects.toThrow(HOST_ERROR_MESSAGE);
    expect(requested).toStrictEqual([]);
  });

  it("refuses unexpected ports and embedded credentials", async () => {
    const { http, requested } = buildHttp(new Uint8Array());

    await expect(new FnetDocumentAdapter(http).fetchDocument("https://fnet.bmfbovespa.com.br:8443/fnet/publico/exibirDocumento?id=123"))
      .rejects.toThrow("the filing link specifies an unexpected port");
    await expect(new FnetDocumentAdapter(http).fetchDocument("https://user:pass@fnet.bmfbovespa.com.br/fnet/publico/exibirDocumento?id=123"))
      .rejects.toThrow("the filing link contains credentials");
    expect(requested).toStrictEqual([]);
  });

  it("refuses unauthorized paths on fnet.bmfbovespa.com.br", async () => {
    const { http, requested } = buildHttp(new Uint8Array());

    await expect(new FnetDocumentAdapter(http).fetchDocument("https://fnet.bmfbovespa.com.br/fnet/publico/outraCoisa?id=123"))
      .rejects.toThrow(PATH_ERROR_MESSAGE);
    expect(requested).toStrictEqual([]);
  });

  it("refuses missing or non-positive document IDs", async () => {
    const { http, requested } = buildHttp(new Uint8Array());

    await expect(new FnetDocumentAdapter(http).fetchDocument("https://fnet.bmfbovespa.com.br/fnet/publico/exibirDocumento"))
      .rejects.toThrow(ID_ERROR_MESSAGE);
    await expect(new FnetDocumentAdapter(http).fetchDocument("https://fnet.bmfbovespa.com.br/fnet/publico/exibirDocumento?id=0"))
      .rejects.toThrow(ID_ERROR_MESSAGE);
    await expect(new FnetDocumentAdapter(http).fetchDocument("https://fnet.bmfbovespa.com.br/fnet/publico/exibirDocumento?id=-42"))
      .rejects.toThrow(ID_ERROR_MESSAGE);
    await expect(new FnetDocumentAdapter(http).fetchDocument("https://fnet.bmfbovespa.com.br/fnet/publico/exibirDocumento?id=abc"))
      .rejects.toThrow(ID_ERROR_MESSAGE);
    expect(requested).toStrictEqual([]);
  });

  it("redacts secret tokens if present in failure strings", () => {
    const fakeSecret = "secret-token-123456";
    const rawError = `failed fetching https://fnet.bmfbovespa.com.br/fnet/publico/exibirDocumento?id=123&token=${fakeSecret}`;
    const redacted = RedactUtil.redactText(rawError, [fakeSecret]);

    expect(redacted).not.toContain(fakeSecret);
    expect(redacted).toContain("[REDACTED]");
  });
});
