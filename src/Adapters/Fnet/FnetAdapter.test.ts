import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FnetAdapter } from "@/Adapters/Fnet/FnetAdapter.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import type { ProviderRequest } from "@/Protocols/ProviderProtocol.ts";

const FIXTURES_DIR = join(import.meta.dirname, "..", "..", "Testing", "fixtures", "fnet");
const SAMPLE_JSON = readFileSync(join(FIXTURES_DIR, "fnet-search-response.json"), "utf8");
const KNOWN_CNPJ = "11.728.688/0001-47";
const KNOWN_DIGITS = "11728688000147";
const REPORT_TYPE = "Relatório Gerencial";

const REQUEST: ProviderRequest = {
  market: "BR",
  ticker: "HGLG11",
  assetType: "fii",
};

type FakeTextHttp = {
  http: HttpPort;
  urls: string[];
};

const buildHttp = (responses: Record<string, string> | ((url: string) => string)): FakeTextHttp => {
  const urls: string[] = [];
  const http: HttpPort = {
    getText: (url: string) => {
      urls.push(url);
      if (typeof responses === "function") {
        return Promise.resolve(responses(url));
      }
      const response = responses[url];
      if (response === undefined) {
        return Promise.reject(new Error(`404: ${url}`));
      }
      return Promise.resolve(response);
    },
    getCookies: () => Promise.reject(new Error("not used")),
    postForm: () => Promise.reject(new Error("not used")),
    getBytes: () => Promise.reject(new Error("not used")),
  };
  return { http, urls };
};

describe("FnetAdapter.fetchTables()", () => {
  it("rejects non-BR markets with zero HTTP requests (AC2)", async () => {
    const { http, urls } = buildHttp({});
    const adapter = new FnetAdapter(http, () => Promise.resolve(KNOWN_CNPJ));

    await expect(adapter.fetchTables({ ...REQUEST, market: "US" }))
      .rejects.toThrow("FNET only serves the BR market; US is not supported");
    expect(urls).toStrictEqual([]);
  });

  it("rejects non-fii asset types with zero HTTP requests (AC2)", async () => {
    const { http, urls } = buildHttp({});
    const adapter = new FnetAdapter(http, () => Promise.resolve(KNOWN_CNPJ));

    await expect(adapter.fetchTables({ ...REQUEST, assetType: "stock" }))
      .rejects.toThrow("FNET only serves fii assets; stock is not supported");
    expect(urls).toStrictEqual([]);
  });

  it("throws when CNPJ is missing or unmapped, making zero HTTP requests (AC2)", async () => {
    const { http, urls } = buildHttp({});
    const adapter = new FnetAdapter(http, () => Promise.resolve(undefined));

    await expect(adapter.fetchTables(REQUEST))
      .rejects.toThrow("cannot map BR:HGLG11 to a FNET fund; no CNPJ is known for it");
    expect(urls).toStrictEqual([]);
  });

  it("throws when CNPJ is invalid (not 14 digits), making zero HTTP requests (AC2)", async () => {
    const { http, urls } = buildHttp({});
    const adapter = new FnetAdapter(http, () => Promise.resolve("12345"));

    await expect(adapter.fetchTables(REQUEST))
      .rejects.toThrow("cannot query FNET for BR:HGLG11; \"12345\" is not a valid 14-digit CNPJ");
    expect(urls).toStrictEqual([]);
  });

  it("normalizes CNPJ punctuation and filters strictly for managerial reports (AC2)", async () => {
    const { http, urls } = buildHttp((url) => {
      expect(url).toContain(`cnpjFundo=${KNOWN_DIGITS}`);
      return SAMPLE_JSON;
    });
    const adapter = new FnetAdapter(http, () => Promise.resolve(KNOWN_CNPJ));

    const result = await adapter.fetchTables(REQUEST);

    expect(urls).toHaveLength(1);
    expect(result.source).toBe("fnet");
    const filings = result.tables.filings ?? [];
    // Why: the sample JSON has 5 items; 3 are Relatório Gerencial and 2 are other types that must be filtered out.
    expect(filings).toHaveLength(3);

    const first = filings[0];
    expect(first?.filing_type).toBe("fii_management_report");
    expect(first?.source).toBe("fnet");
    expect(first?.market).toBe("BR");
    expect(first?.ticker).toBe("HGLG11");
    expect(first?.asset_type).toBe("fii");
    expect(first?.category).toBe("Relatórios");
    expect(first?.delivered_at).toBe("2026-10-13T19:23:00-03:00");
    expect(first?.url).toBe("https://fnet.bmfbovespa.com.br/fnet/publico/exibirDocumento?id=1348097&cvm=true");
    expect(first?.file_hash).toBeNull();
    expect(first?.filing_id).toMatch(/^[a-f0-9]{32}$/);
  });

  it("produces stable unique IDs per document version and prevents duplicates on re-fetch (AC2)", async () => {
    const { http } = buildHttp(() => SAMPLE_JSON);
    const adapter = new FnetAdapter(http, () => Promise.resolve(KNOWN_CNPJ));

    const runOne = await adapter.fetchTables(REQUEST);
    const runTwo = await adapter.fetchTables(REQUEST);

    const idsOne = (runOne.tables.filings ?? []).map((row) => row.filing_id);
    const idsTwo = (runTwo.tables.filings ?? []).map((row) => row.filing_id);
    expect(idsOne).toStrictEqual(idsTwo);
    expect(new Set(idsOne).size).toBe(idsOne.length);
  });

  it("paginates across multiple pages until recordsTotal is reached (AC2)", async () => {
    const pageOne = JSON.stringify({
      data: [
        {
          id: 1001,
          versao: 1,
          tipoDocumento: REPORT_TYPE,
          dataEntrega: "01/01/2026 10:00",
        },
      ],
      recordsTotal: 2,
    });
    const pageTwo = JSON.stringify({
      data: [
        {
          id: 1002,
          versao: 1,
          tipoDocumento: REPORT_TYPE,
          dataEntrega: "01/02/2026 10:00",
        },
      ],
      recordsTotal: 2,
    });

    const { http, urls } = buildHttp((url) => {
      if (url.includes("s=0&")) {
        return pageOne;
      }
      return pageTwo;
    });

    const adapter = new FnetAdapter(http, () => Promise.resolve(KNOWN_CNPJ));
    const result = await adapter.fetchTables(REQUEST);

    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain("s=0&");
    expect(urls[1]).toContain("s=1&");
    expect(result.tables.filings).toHaveLength(2);
  });

  it("handles empty listing gracefully without looping (AC2)", async () => {
    const emptyJson = JSON.stringify({ data: [], recordsTotal: 0 });
    const { http, urls } = buildHttp(() => emptyJson);
    const adapter = new FnetAdapter(http, () => Promise.resolve(KNOWN_CNPJ));

    const result = await adapter.fetchTables(REQUEST);

    expect(urls).toHaveLength(1);
    expect(result.tables.filings).toStrictEqual([]);
  });

  it("fails when FNET returns an empty body", async () => {
    const { http } = buildHttp(() => "   ");
    const adapter = new FnetAdapter(http, () => Promise.resolve(KNOWN_CNPJ));

    await expect(adapter.fetchTables(REQUEST))
      .rejects.toThrow("FNET answered HGLG11 with an empty body");
  });

  it("fails when FNET returns invalid JSON (AC4)", async () => {
    const { http } = buildHttp(() => "<html>502 Bad Gateway</html>");
    const adapter = new FnetAdapter(http, () => Promise.resolve(KNOWN_CNPJ));

    await expect(adapter.fetchTables(REQUEST))
      .rejects.toThrow("the response format changed: FNET did not send JSON for HGLG11");
  });

  it("fails when FNET schema deviates from expected structure (AC4)", async () => {
    const { http } = buildHttp(() => JSON.stringify({ data: "not-an-array", recordsTotal: "invalid" }));
    const adapter = new FnetAdapter(http, () => Promise.resolve(KNOWN_CNPJ));

    await expect(adapter.fetchTables(REQUEST))
      .rejects.toThrow("the response format changed: FNET sent an error or an unknown shape for HGLG11");
  });
});

describe("FnetAdapter.isManagerialReport()", () => {
  it("normalizes and matches varied diacritics in tipoDocumento", () => {
    expect(FnetAdapter.isManagerialReport("Relatório Gerencial")).toBe(true);
    expect(FnetAdapter.isManagerialReport("relatorio gerencial")).toBe(true);
    expect(FnetAdapter.isManagerialReport(" RELATÓRIO GERENCIAL ")).toBe(true);
    expect(FnetAdapter.isManagerialReport("Fato Relevante")).toBe(false);
    expect(FnetAdapter.isManagerialReport(null)).toBe(false);
  });
});

describe("FnetAdapter.parseDeliveredAt()", () => {
  it("parses Brazilian date string to UTC-3 ISO string", () => {
    expect(FnetAdapter.parseDeliveredAt("13/10/2026 19:23")).toBe("2026-10-13T19:23:00-03:00");
    expect(FnetAdapter.parseDeliveredAt("13/10/2026 19:23:45")).toBe("2026-10-13T19:23:45-03:00");
    expect(FnetAdapter.parseDeliveredAt("13/10/2026")).toBe("2026-10-13T00:00:00-03:00");
    expect(FnetAdapter.parseDeliveredAt("invalid")).toBeNull();
    expect(FnetAdapter.parseDeliveredAt(null)).toBeNull();
  });
});
