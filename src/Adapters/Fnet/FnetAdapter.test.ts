import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FnetAdapter } from "@/Adapters/Fnet/FnetAdapter.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import type { ProviderRequest } from "@/Protocols/ProviderProtocol.ts";
import { ChunkService } from "@/Services/ChunkService.ts";

const FIXTURES_DIR = join(import.meta.dirname, "..", "..", "Testing", "fixtures", "fnet");
const REAL_SEARCH_JSON = readFileSync(join(FIXTURES_DIR, "fnet-search-response.json"), "utf8");
const HGLG11_EXCERPT = readFileSync(join(FIXTURES_DIR, "hglg11-doc-1348097-page5-excerpt.txt"), "utf8");
const KNRI11_EXCERPT = readFileSync(join(FIXTURES_DIR, "knri11-doc-1368920-page1-excerpt.txt"), "utf8");

const KNOWN_CNPJ = "11.728.688/0001-47";
const KNOWN_DIGITS = "11728688000147";
const REPORT_TYPE = "Relatório Gerencial";
const SAMPLE_DELIVERY_DATE = "01/01/2026 10:00";
const SHAPE_ERROR = "the response format changed: FNET sent an error or an unknown shape for HGLG11";
const OUT_OF_BOUNDS_ERROR = "the response format changed: FNET sent an out-of-bounds delivery date";

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
  it("rejects non-BR markets with zero HTTP requests", async () => {
    const { http, urls } = buildHttp({});
    const adapter = new FnetAdapter(http, () => Promise.resolve(KNOWN_CNPJ));

    await expect(adapter.fetchTables({ ...REQUEST, market: "US" }))
      .rejects.toThrow("FNET only serves the BR market; US is not supported");
    expect(urls).toStrictEqual([]);
  });

  it("rejects non-fii asset types with zero HTTP requests", async () => {
    const { http, urls } = buildHttp({});
    const adapter = new FnetAdapter(http, () => Promise.resolve(KNOWN_CNPJ));

    await expect(adapter.fetchTables({ ...REQUEST, assetType: "stock" }))
      .rejects.toThrow("FNET only serves fii assets; stock is not supported");
    expect(urls).toStrictEqual([]);
  });

  it("throws when CNPJ is missing or unmapped, making zero HTTP requests", async () => {
    const { http, urls } = buildHttp({});
    const adapter = new FnetAdapter(http, () => Promise.resolve(undefined));

    await expect(adapter.fetchTables(REQUEST))
      .rejects.toThrow("cannot map BR:HGLG11 to a FNET fund; no CNPJ is known for it");
    expect(urls).toStrictEqual([]);
  });

  it("throws when CNPJ is invalid (not 14 digits), making zero HTTP requests", async () => {
    const { http, urls } = buildHttp({});
    const adapter = new FnetAdapter(http, () => Promise.resolve("12345"));

    await expect(adapter.fetchTables(REQUEST))
      .rejects.toThrow("cannot query FNET for BR:HGLG11; \"12345\" is not a valid 14-digit CNPJ");
    expect(urls).toStrictEqual([]);
  });

  it("normalizes CNPJ punctuation and filters real fixture strictly for managerial reports", async () => {
    const { http, urls } = buildHttp((url) => {
      expect(url).toContain(`cnpjFundo=${KNOWN_DIGITS}`);
      return REAL_SEARCH_JSON;
    });
    const adapter = new FnetAdapter(http, () => Promise.resolve(KNOWN_CNPJ));

    const result = await adapter.fetchTables(REQUEST);

    expect(urls).toHaveLength(1);
    expect(result.source).toBe("fnet");
    const filings = result.tables.filings ?? [];
    // Why: real search fixture has 5 records from offset 5, where exactly 1 is Relatório Gerencial (id 1348097).
    expect(filings).toHaveLength(1);

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

  it("produces stable unique IDs per document version and prevents duplicates on re-fetch", async () => {
    const { http } = buildHttp(() => REAL_SEARCH_JSON);
    const adapter = new FnetAdapter(http, () => Promise.resolve(KNOWN_CNPJ));

    const runOne = await adapter.fetchTables(REQUEST);
    const runTwo = await adapter.fetchTables(REQUEST);

    const idsOne = (runOne.tables.filings ?? []).map((row) => row.filing_id);
    const idsTwo = (runTwo.tables.filings ?? []).map((row) => row.filing_id);
    expect(idsOne).toStrictEqual(idsTwo);
    expect(new Set(idsOne).size).toBe(idsOne.length);
  });

  it("paginates across multiple pages until recordsFiltered is reached", async () => {
    const pageOne = JSON.stringify({
      data: [
        {
          id: 1001,
          versao: 1,
          tipoDocumento: REPORT_TYPE,
          dataEntrega: SAMPLE_DELIVERY_DATE,
        },
      ],
      recordsTotal: 10,
      recordsFiltered: 2,
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
      recordsTotal: 10,
      recordsFiltered: 2,
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

  it("throws explicit error when pagination returns an empty page before reaching expected total", async () => {
    const pageOne = JSON.stringify({
      data: [],
      recordsTotal: 50,
      recordsFiltered: 50,
    });
    const { http } = buildHttp(() => pageOne);
    const adapter = new FnetAdapter(http, () => Promise.resolve(KNOWN_CNPJ));

    await expect(adapter.fetchTables(REQUEST))
      .rejects.toThrow("FNET pagination for HGLG11 returned an empty page before reaching expected 50 records (fetched 0)");
  });

  it("throws explicit error when pagination reaches page cap before reaching total", async () => {
    const syntheticItem = {
      id: 1000,
      versao: 1,
      tipoDocumento: REPORT_TYPE,
      dataEntrega: SAMPLE_DELIVERY_DATE,
    };
    const syntheticPage = JSON.stringify({
      data: [syntheticItem],
      recordsTotal: 1000,
      recordsFiltered: 1000,
    });
    const { http } = buildHttp(() => syntheticPage);
    const adapter = new FnetAdapter(http, () => Promise.resolve(KNOWN_CNPJ));

    await expect(adapter.fetchTables(REQUEST))
      .rejects.toThrow("FNET pagination for HGLG11 reached maximum page limit of 50 before completing");
  });

  it("handles empty listing gracefully without looping", async () => {
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

  it("fails when FNET returns invalid JSON", async () => {
    const { http } = buildHttp(() => "<html>502 Bad Gateway</html>");
    const adapter = new FnetAdapter(http, () => Promise.resolve(KNOWN_CNPJ));

    await expect(adapter.fetchTables(REQUEST))
      .rejects.toThrow("the response format changed: FNET did not send JSON for HGLG11");
  });

  it("fails when FNET schema deviates: missing data array", async () => {
    const { http } = buildHttp(() => JSON.stringify({ recordsTotal: 10 }));
    const adapter = new FnetAdapter(http, () => Promise.resolve(KNOWN_CNPJ));

    await expect(adapter.fetchTables(REQUEST))
      .rejects.toThrow(SHAPE_ERROR);
  });

  it("fails when FNET schema deviates: missing recordsTotal", async () => {
    const { http } = buildHttp(() => JSON.stringify({ data: [] }));
    const adapter = new FnetAdapter(http, () => Promise.resolve(KNOWN_CNPJ));

    await expect(adapter.fetchTables(REQUEST))
      .rejects.toThrow(SHAPE_ERROR);
  });

  it("fails when FNET schema deviates: missing version in document item", async () => {
    const itemWithoutVersion = {
      id: 123,
      tipoDocumento: REPORT_TYPE,
      dataEntrega: SAMPLE_DELIVERY_DATE,
    };
    const { http } = buildHttp(() => JSON.stringify({ data: [itemWithoutVersion], recordsTotal: 1 }));
    const adapter = new FnetAdapter(http, () => Promise.resolve(KNOWN_CNPJ));

    await expect(adapter.fetchTables(REQUEST))
      .rejects.toThrow(SHAPE_ERROR);
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
    expect(FnetAdapter.parseDeliveredAt("13/10/2026 19:23", "HGLG11")).toBe("2026-10-13T19:23:00-03:00");
    expect(FnetAdapter.parseDeliveredAt("13/10/2026 19:23:45", "HGLG11")).toBe("2026-10-13T19:23:45-03:00");
    expect(FnetAdapter.parseDeliveredAt("13/10/2026", "HGLG11")).toBe("2026-10-13T00:00:00-03:00");
    expect(FnetAdapter.parseDeliveredAt(null, "HGLG11")).toBeNull();
    expect(FnetAdapter.parseDeliveredAt("", "HGLG11")).toBeNull();
  });

  it("fails with format error when delivery date is impossible calendar date", () => {
    expect(() => FnetAdapter.parseDeliveredAt("99/99/2026 19:23", "HGLG11"))
      .toThrow(OUT_OF_BOUNDS_ERROR);
    expect(() => FnetAdapter.parseDeliveredAt("31/02/2026 10:00", "HGLG11"))
      .toThrow("the response format changed: FNET sent an invalid calendar date \"31/02/2026 10:00\" for HGLG11");
    expect(() => FnetAdapter.parseDeliveredAt("13/10/2026 25:00", "HGLG11"))
      .toThrow(OUT_OF_BOUNDS_ERROR);
  });
});

describe("FnetAdapter.buildRow()", () => {
  it("processes real extracted pages through ChunkService and preserves financial data with page references", () => {
    const hglgChunks = ChunkService.split([
      { section: "Comentários da Gestão", page: 5, text: HGLG11_EXCERPT },
    ]);
    expect(hglgChunks.length).toBeGreaterThan(0);
    expect(hglgChunks[0]?.page).toBe(5);
    expect(hglgChunks[0]?.section).toBe("Comentários da Gestão");
    expect(hglgChunks[0]?.text).toContain("Patrimônio Líquido");
    expect(hglgChunks[0]?.text).toContain("R$ 7,5 bilhões");
    expect(hglgChunks[0]?.text).toContain("R$ 165,48");
    expect(hglgChunks[0]?.text).toContain("R$ 1,17/cota");

    const knriChunks = ChunkService.split([
      { section: "Objetivo do Fundo", page: 1, text: KNRI11_EXCERPT },
    ]);
    expect(knriChunks).toHaveLength(4);
    expect(knriChunks.every((chunk) => chunk.page === 1)).toBe(true);
    expect(knriChunks[0]?.section).toBe("Objetivo do Fundo");
    expect(knriChunks[0]?.text).toContain("PATRIMÔNIO LÍQUIDO");
    expect(knriChunks[0]?.text).toContain("R$ 4.602.278.866,50");
    expect(knriChunks[0]?.text).toContain("1,93%");
    expect(knriChunks[0]?.text).toContain("4,83%");
    expect(knriChunks.some((chunk) => chunk.text.includes("R$ 1,10 por cota"))).toBe(true);
  });
});
