import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CvmAdapter } from "@/Adapters/Cvm/CvmAdapter.ts";
import { CvmUtil } from "@/Utils/CvmUtil.ts";
import { FakeHttp } from "@/Testing/FakeHttp.ts";
import { ZipFixture } from "@/Testing/ZipFixture.ts";

const FIXTURES = join(import.meta.dirname, "..", "..", "Testing", "fixtures", "cvm");
const SAMPLE = readFileSync(join(FIXTURES, "ipe-2024-petrobras-sample.csv"), "latin1");
const PERIODIC_SAMPLE = readFileSync(join(FIXTURES, "periodic-sample.csv"), "latin1");
const PETROBRAS = "33.000.167/0001-01";
const PETROBRAS_DIGITS = "33000167000101";
const SAMPLE_COMPANY = "12.345.678/0001-90";
const key = { market: "BR", ticker: "PETR4", assetType: "stock" };
const rowKey = { market: "BR", ticker: "PETR4", asset_type: "stock" };
const CURRENT_YEAR = 2025;
const BASE = "https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC";
const splitLines = (text: string): string[] => text.split(/\r?\n/u);
const collectLines = async (lines: AsyncIterable<string>): Promise<string[]> => {
  const collected: string[] = [];
  for await (const line of lines) {
    collected.push(line);
  }
  return collected;
};
const resolveKnownCompany = () => Promise.resolve(PETROBRAS);
const readPeriodicLines = (category: string): string => {
  const [header = "", ...lines] = splitLines(PERIODIC_SAMPLE);
  // Why: the periodic sample holds one line per kind; a yearly file holds only its own kind, so the test takes the kind's lines.
  const kept = lines.filter((line) => line.includes(`;${category};`)).map((line) => line.replace(SAMPLE_COMPANY, PETROBRAS));
  return [header, ...kept].join("\n");
};

describe("CvmAdapter.readRows()", () => {
  it("keeps the lines of the company with the filing type and the original category (AC1, AC2)", async () => {
    const rows = await CvmAdapter.readRows(splitLines(SAMPLE), "33000167000101", rowKey);
    expect(rows).toHaveLength(6);
    expect(rows.every((row) => row.source === "cvm" && row.market === "BR" && row.ticker === "PETR4")).toBe(true);
    expect(rows.filter((row) => row.category === "Assembleia").every((row) => row.filing_type === "other")).toBe(true);
    expect(rows.filter((row) => row.category === "Fato Relevante").every((row) => row.filing_type === "material_fact")).toBe(true);
    expect(rows[0]?.delivered_at).toBe("2024-03-22T00:00:00-03:00");
    expect(rows[0]?.url).toContain("rad.cvm.gov.br");
  });

  it("keeps both deliveries of the same document, each with its own delivery date and a unique id (AC5)", async () => {
    const [first = ""] = SAMPLE.split("\n").slice(1).filter((line) => line.startsWith(PETROBRAS));
    const redelivery = first.replace(";2024-03-22;AP", ";2024-05-02;AP").replace("IPE250420240104537305-83", "IPE020520240104999999-01");
    const text = `${SAMPLE.split("\n")[0]}\n${first}\n${redelivery}\n`;
    const rows = await CvmAdapter.readRows(splitLines(text), "33000167000101", rowKey);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.filing_id)).size).toBe(2);
    expect(rows.map((row) => row.delivered_at)).toStrictEqual(["2024-03-22T00:00:00-03:00", "2024-05-02T00:00:00-03:00"]);
  });

  it("does not keep the lines of other companies", async () => {
    const rows = await CvmAdapter.readRows(splitLines(SAMPLE), "99999999999999", rowKey);
    expect(rows).toStrictEqual([]);
  });

  it("maps a sustainability report to sustainability", async () => {
    const text = `${SAMPLE.split("\n")[0]}\n${PETROBRAS};X;1;2024-01-01;Relatório de Sustentabilidade;;;Relato;2024-01-02;AP;PROTO-1;1;https://example.org/doc\n`;
    const [row] = await CvmAdapter.readRows(splitLines(text), "33000167000101", rowKey);
    expect(row?.filing_type).toBe("sustainability");
  });

  it("fails with a format-changed message when the header differs (AC5 format)", async () => {
    const attempt = CvmAdapter.readRows(splitLines("a;b;c\n1;2;3\n"), "33000167000101", rowKey);
    await expect(attempt).rejects.toThrow("the response format changed");
  });

  it("fails when a line has another number of fields", async () => {
    const text = `${SAMPLE.split("\n")[0]}\n${PETROBRAS};only;three\n`;
    const attempt = CvmAdapter.readRows(splitLines(text), "33000167000101", rowKey);
    await expect(attempt).rejects.toThrow("another number of fields");
  });

  it("reads lines across chunk boundaries, with CRLF and a last line without a break (streaming)", () => {
    const bytes = new TextEncoder().encode("a;b\r\nc;d\r\nlast;line");
    const chunks = [bytes.slice(0, 3), bytes.slice(3, 4), bytes.slice(4, 9), bytes.slice(9)];
    const decoded = CvmUtil.readLines(Readable.from(chunks));
    return collectLines(decoded).then((lines) => {
      expect(lines).toStrictEqual(["a;b", "c;d", "last;line"]);
    });
  });
});

describe("CvmAdapter.readPeriodicRows()", () => {
  it("keeps the company's ITR lines with the kind of the file, the delivery date and the document link", async () => {
    const lines = splitLines(readPeriodicLines("ITR"));
    const rows = await CvmAdapter.readPeriodicRows(lines, "33000167000101", rowKey, "itr");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      market: "BR",
      ticker: "PETR4",
      asset_type: "stock",
      filing_type: "itr",
      category: "ITR",
      delivered_at: "2025-05-15T00:00:00-03:00",
      subject: null,
      source: "cvm",
    });
    expect(rows[0]?.url).toContain("NumeroSequencialDocumento=147933");
  });

  it("gives the FRE lines a filing id of their own, distinct from the same company's ITR", async () => {
    const freLines = splitLines(readPeriodicLines("FRE WEB"));
    const itrLines = splitLines(readPeriodicLines("ITR"));
    const fre = await CvmAdapter.readPeriodicRows(freLines, "33000167000101", rowKey, "fre");
    const itr = await CvmAdapter.readPeriodicRows(itrLines, "33000167000101", rowKey, "itr");
    expect(fre[0]?.filing_type).toBe("fre");
    expect(fre[0]?.filing_id).not.toBe(itr[0]?.filing_id);
  });

  it("fails with a format-changed message when the header is not the one the adapter reads", () => {
    const attempt = CvmAdapter.readPeriodicRows(["a;b;c"], "33000167000101", rowKey, "itr");
    return expect(attempt).rejects.toThrow("the response format changed");
  });
});

describe("CvmAdapter.fetchTables()", () => {
  it("reads the yearly IPE, ITR, DFP and FRE files, skips a year without a file and fills filings (AC1)", async () => {
    const itrZip = ZipFixture.buildZipOf({ "itr_cia_aberta_2025.csv": readPeriodicLines("ITR") });
    const files = {
      [`${BASE}/IPE/DADOS/ipe_cia_aberta_2024.zip`]: ZipFixture.buildZipOf({ "ipe_cia_aberta_2024.csv": SAMPLE }),
      [`${BASE}/ITR/DADOS/itr_cia_aberta_2025.zip`]: itrZip,
    };
    const { http, urls } = FakeHttp.buildServing(files);
    const adapter = new CvmAdapter(http, resolveKnownCompany, CvmAdapter.BASE_URL, () => CURRENT_YEAR);
    const result = await adapter.fetchTables(key);

    expect(urls).toHaveLength(12);
    expect(urls.slice(0, 4)).toStrictEqual([
      `${BASE}/IPE/DADOS/ipe_cia_aberta_2023.zip`,
      `${BASE}/ITR/DADOS/itr_cia_aberta_2023.zip`,
      `${BASE}/DFP/DADOS/dfp_cia_aberta_2023.zip`,
      `${BASE}/FRE/DADOS/fre_cia_aberta_2023.zip`,
    ]);
    expect(result.source).toBe("cvm");
    expect(result.tables.filings).toHaveLength(7);
  });

  it("names the ticker as pending when it cannot be mapped to a company, and guesses nothing (AC8)", async () => {
    const { http, urls } = FakeHttp.buildServing({});
    await expect(new CvmAdapter(http, () => Promise.resolve(undefined)).fetchTables(key))
      .rejects.toThrow("unmapped: BR:PETR4 is pending");
    expect(urls).toStrictEqual([]);
  });

  it("stops the load when a file is damaged, and writes nothing", async () => {
    const brokenFile = new TextEncoder().encode("broken");
    const { http } = FakeHttp.buildServing({
      [`${BASE}/IPE/DADOS/ipe_cia_aberta_2024.zip`]: brokenFile,
    });
    await expect(new CvmAdapter(http, resolveKnownCompany, CvmAdapter.BASE_URL, () => CURRENT_YEAR).fetchTables(key))
      .rejects.toThrow("not a zip archive");
  });

  describe("with a period", () => {
    it("loads only the years of the period, including a past year, and no other year (AC4)", async () => {
      const { http, urls } = FakeHttp.buildServing({});
      const window = { from: "2019-06-01", to: "2020-03-31" };
      const adapter = new CvmAdapter(http, resolveKnownCompany, CvmAdapter.BASE_URL, () => CURRENT_YEAR);
      await adapter.fetchTables({ ...key, period: window });
      expect(urls.filter((url) => url.includes("_2018.zip") || url.includes("_2021.zip"))).toStrictEqual([]);
      expect(urls.filter((url) => url.includes("_2019.zip"))).toHaveLength(4);
      expect(urls.filter((url) => url.includes("_2020.zip"))).toHaveLength(4);
    });

    it("keeps only the filings whose reference date is inside the period, and a row with no reference date is left out", async () => {
      const window = { from: "2025-01-01", to: "2025-12-31" };
      const inside = `${PETROBRAS};X;1;2025-06-30;Relatório de Sustentabilidade;;;Relato;2025-07-01;AP;PROTO-IN;1;https://example.org/in`;
      const outside = `${PETROBRAS};X;1;2024-06-30;Relatório de Sustentabilidade;;;Relato;2025-07-01;AP;PROTO-OUT;1;https://example.org/out`;
      const undated = `${PETROBRAS};X;1;;Relatório de Sustentabilidade;;;Relato;2025-07-01;AP;PROTO-NONE;1;https://example.org/none`;
      const header = splitLines(SAMPLE)[0] ?? "";
      const rows = await CvmAdapter.readRows([header, inside, outside, undated], PETROBRAS_DIGITS, rowKey, window);
      expect(rows.map((row) => row.reference_date)).toStrictEqual(["2025-06-30"]);
    });

    it("does not look at the reference date when no period is given", async () => {
      const header = splitLines(SAMPLE)[0] ?? "";
      const undated = `${PETROBRAS};X;1;;Relatório de Sustentabilidade;;;Relato;2025-07-01;AP;PROTO-NONE;1;https://example.org/none`;
      const rows = await CvmAdapter.readRows([header, undated], PETROBRAS_DIGITS, rowKey);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.reference_date).toBeNull();
    });
  });

  describe("failures", () => {
    it("names a server error as an HTTP error and loads nothing after it (AC7)", async () => {
      const { HttpFailureError } = await import("@/Errors/HttpFailureError.ts");
      const http = {
        getText: () => Promise.reject(new Error("not used")),
        postForm: () => Promise.reject(new Error("not used")),
        downloadToFile: () => Promise.reject(new Error("not used")),
        getCookies: () => Promise.reject(new Error("not used")),
        getBytes: () => Promise.reject(new HttpFailureError("the vendor answered with status 500", 500)),
      };
      await expect(new CvmAdapter(http, resolveKnownCompany, CvmAdapter.BASE_URL, () => CURRENT_YEAR).fetchTables(key))
        .rejects.toThrow("CVM: HTTP error:");
    });

    it("names a refused request as blocked, not as a missing file (AC7)", async () => {
      const { HttpRefusedError } = await import("@/Errors/HttpRefusedError.ts");
      const http = {
        getText: () => Promise.reject(new Error("not used")),
        postForm: () => Promise.reject(new Error("not used")),
        downloadToFile: () => Promise.reject(new Error("not used")),
        getCookies: () => Promise.reject(new Error("not used")),
        getBytes: () => Promise.reject(new HttpRefusedError("the vendor redirected the request, and redirects are not followed")),
      };
      await expect(new CvmAdapter(http, resolveKnownCompany, CvmAdapter.BASE_URL, () => CURRENT_YEAR).fetchTables(key))
        .rejects.toThrow("CVM: blocked or refused request:");
    });

    it("records each downloaded file with its URL, year, size and hash, so a version can be told apart (S4)", async () => {
      const ipe = ZipFixture.buildZipOf({ "ipe_cia_aberta_2024.csv": SAMPLE });
      const { http } = FakeHttp.buildServing({ [`${BASE}/IPE/DADOS/ipe_cia_aberta_2024.zip`]: ipe });
      const result = await new CvmAdapter(http, resolveKnownCompany, CvmAdapter.BASE_URL, () => CURRENT_YEAR).fetchTables({ ...key, period: { from: "2024-01-01", to: "2024-12-31" } });
      expect(result.files).toStrictEqual([{
        url: `${BASE}/IPE/DADOS/ipe_cia_aberta_2024.zip`,
        dataset: "cia_aberta-doc-ipe",
        referenceYear: 2024,
        sha256: CvmUtil.buildFileRecord(`${BASE}/IPE/DADOS/ipe_cia_aberta_2024.zip`, "x", 2024, ipe).sha256,
        sizeBytes: ipe.byteLength,
      }]);
    });
  });
});
