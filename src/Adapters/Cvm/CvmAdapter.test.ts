import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { CvmAdapter } from "@/Adapters/Cvm/CvmAdapter.ts";
import { HttpFailureError } from "@/Errors/HttpFailureError.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";

const SAMPLE_PATH = join(import.meta.dirname, "..", "..", "Testing", "fixtures", "cvm", "ipe-2024-petrobras-sample.csv");
const SAMPLE = readFileSync(SAMPLE_PATH, "latin1");
const PETROBRAS = "33.000.167/0001-01";
const key = { market: "BR", ticker: "PETR4", assetType: "stock" };
const rowKey = { market: "BR", ticker: "PETR4", asset_type: "stock" };
const CURRENT_YEAR = 2025;
const splitLines = (text: string): string[] => text.split(/\r?\n/u);
const collectLines = async (lines: AsyncIterable<string>): Promise<string[]> => {
  const collected: string[] = [];
  for await (const line of lines) {
    collected.push(line);
  }
  return collected;
};

const buildZipOf = (name: string, text: string): Uint8Array => {
  // Why: a small zip with one entry, built here, so the test never needs the 2 MB yearly file.
  const nameBytes = Buffer.from(name);
  const raw = Buffer.from(text, "latin1");
  const packed = deflateRawSync(raw);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(packed.length, 18);
  local.writeUInt32LE(Buffer.byteLength(text, "latin1"), 22);
  local.writeUInt16LE(nameBytes.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(packed.length, 20);
  central.writeUInt32LE(Buffer.byteLength(text, "latin1"), 24);
  central.writeUInt16LE(nameBytes.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + nameBytes.length, 12);
  end.writeUInt32LE(local.length + nameBytes.length + packed.length, 16);
  return new Uint8Array(Buffer.concat([local, nameBytes, packed, central, nameBytes, end]));
};

const buildHttpServing = (pathToFile: Readonly<Record<string, Uint8Array>>): {
  http: HttpPort;
  urls: string[];
} => {
  const urls: string[] = [];
  const http: HttpPort = {
    getText: () => Promise.reject(new Error("not used")),
    postForm: () => Promise.reject(new Error("not used")),
    getBytes: (url: string) => {
      urls.push(url);
      const file = pathToFile[url];
      if (file === undefined) {
        return Promise.reject(new HttpFailureError("the vendor answered with status 404", 404));
      }
      return Promise.resolve(file);
    },
  };
  return { http, urls };
};

const resolveKnownCompany = () => Promise.resolve(PETROBRAS);

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
    const decoded = CvmAdapter.readLines(Readable.from(chunks));
    return collectLines(decoded).then((lines) => {
      expect(lines).toStrictEqual(["a;b", "c;d", "last;line"]);
    });
  });
});

describe("CvmAdapter.fetchTables()", () => {
  it("reads the yearly files, skips a year without a file and fills filings (AC1)", async () => {
    const files = {
      "https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/IPE/DADOS/ipe_cia_aberta_2024.zip": buildZipOf("ipe_cia_aberta_2024.csv", SAMPLE),
    };
    const { http, urls } = buildHttpServing(files);
    const adapter = new CvmAdapter(http, resolveKnownCompany, CvmAdapter.BASE_URL, () => CURRENT_YEAR);
    const result = await adapter.fetchTables(key);

    expect(urls).toStrictEqual([
      "https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/IPE/DADOS/ipe_cia_aberta_2023.zip",
      "https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/IPE/DADOS/ipe_cia_aberta_2024.zip",
      "https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/IPE/DADOS/ipe_cia_aberta_2025.zip",
    ]);
    expect(result.source).toBe("cvm");
    expect(result.tables.filings).toHaveLength(6);
  });

  it("names the ticker when it cannot be mapped to a company (AC3)", async () => {
    const { http } = buildHttpServing({});
    await expect(new CvmAdapter(http, () => Promise.resolve(undefined)).fetchTables(key))
      .rejects.toThrow("cannot map BR:PETR4 to a CVM company");
  });

  it("stops the load when a file is damaged, and writes nothing", async () => {
    const brokenFile = new TextEncoder().encode("broken");
    const { http } = buildHttpServing({
      "https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/IPE/DADOS/ipe_cia_aberta_2024.zip": brokenFile,
    });
    await expect(new CvmAdapter(http, resolveKnownCompany, CvmAdapter.BASE_URL, () => CURRENT_YEAR).fetchTables(key))
      .rejects.toThrow("not a zip archive");
  });
});
