import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { CvmRegistryAdapter } from "@/Adapters/Cvm/CvmRegistryAdapter.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import { ZipFixture } from "@/Testing/ZipFixture.ts";

const FIXTURES = join(import.meta.dirname, "..", "..", "Testing", "fixtures", "cvm-registry");
const COMPANY_FIXTURE = join(FIXTURES, "cad_cia_aberta-sample.csv");
const FILING_TEXT = readFileSync(join(FIXTURES, "fca-geral-sample.csv"), "latin1");
const PETROBRAS_CNPJ = "33.000.167/0001-01";
const INVENTED_CNPJ = "99.999.999/0001-99";
const PETROBRAS_IR_SITE = "http://www.petrobras.com.br";
const ASSET_ID = "BR:stock:PETR4";
const PREVIOUS_NAME = "EMPRESA ANTIGA S.A.";
const CURRENT_YEAR = 2026;
const NOT_USED = "not used";

const splitLines = (text: string): AsyncIterable<string> => Readable.from(text.split(/\r?\n/u));

const buildHttp = (): HttpPort => ({
  getText: () => Promise.reject(new Error(NOT_USED)),
  getBytes: () => Promise.reject(new Error(NOT_USED)),
  postForm: () => Promise.reject(new Error(NOT_USED)),
  getCookies: () => Promise.reject(new Error(NOT_USED)),
  downloadToFile: (url: string, filePath: string) => {
    if (url.includes("/FCA/")) {
      writeFileSync(filePath, ZipFixture.buildZipOf({ [`fca_cia_aberta_geral_${CURRENT_YEAR}.csv`]: FILING_TEXT }));
    } else {
      copyFileSync(COMPANY_FIXTURE, filePath);
    }
    return Promise.resolve(1);
  },
});

const buildAdapter = (): CvmRegistryAdapter =>
  new CvmRegistryAdapter(buildHttp(), () => Promise.resolve(PETROBRAS_CNPJ), undefined, () => CURRENT_YEAR);

describe("CvmRegistryAdapter.fetchTables()", () => {
  it("writes the registry of a stock from CVM's company file, found by its CNPJ", async () => {
    const result = await buildAdapter().fetchTables({ market: "BR", ticker: "PETR4", assetType: "stock" });

    expect(result.tables.asset).toStrictEqual([{
      asset_id: ASSET_ID, market: "BR", asset_type: "stock", code: "PETR4", legal_id: PETROBRAS_CNPJ,
      name: "PETRÓLEO BRASILEIRO S.A. - PETROBRAS", trade_name: "PETROBRAS",
      sector: "Petróleo e Gás", situation: "ATIVO", cvm_code: "9512",
    }]);
  });

  it("writes the attributes of the latest filing and writes no row for an empty one (AC2)", async () => {
    const result = await buildAdapter().fetchTables({ market: "BR", ticker: "PETR4", assetType: "stock" });

    expect(result.tables.asset_attribute?.map((row) => row.attribute)).toStrictEqual(["ir_site", "activity_description", "activity_sector"]);
    expect(result.tables.asset_attribute).toContainEqual({ asset_id: ASSET_ID, attribute: "ir_site", value: PETROBRAS_IR_SITE });
    expect(result.tables.asset_attribute).toContainEqual({ asset_id: ASSET_ID, attribute: "activity_sector", value: "Petróleo e Gás" });
  });

  it("reports the file of the filing it read, so a change of the file is seen", async () => {
    const result = await buildAdapter().fetchTables({ market: "BR", ticker: "PETR4", assetType: "stock" });

    expect(result.files).toStrictEqual([expect.objectContaining({ dataset: "cia_aberta-fca-geral", referenceYear: CURRENT_YEAR })]);
  });

  it("reports a ticker with no CNPJ as unmapped, and writes nothing", async () => {
    const adapter = new CvmRegistryAdapter(
      buildHttp(),
      () => Promise.resolve(undefined),
      undefined,
      () => CURRENT_YEAR,
    );

    await expect(adapter.fetchTables({ market: "BR", ticker: "XPTO3", assetType: "stock" })).rejects.toThrow("unmapped: BR:XPTO3 is pending");
  });
});

describe("CvmRegistryAdapter.findLatestFiling()", () => {
  it("keeps the latest reference date, and within it the highest version (AC2)", async () => {
    const filing = await CvmRegistryAdapter.findLatestFiling(splitLines(FILING_TEXT), INVENTED_CNPJ);

    expect(filing?.Versao).toBe("2");
    expect(filing?.Data_Referencia).toBe("2025-12-31");
    expect(filing?.Pagina_Web).toBe("http://www.ficticia.example/ri");
  });

  it("names the previous legal name only when CVM gives one", () => {
    expect(CvmRegistryAdapter.buildAttributes("BR:stock:FICT3", { Nome_Empresarial_Anterior: PREVIOUS_NAME, Pagina_Web: "" })).toStrictEqual([
      { asset_id: "BR:stock:FICT3", attribute: "previous_legal_name", value: PREVIOUS_NAME },
    ]);
  });
});

describe("CvmRegistryAdapter.readNames()", () => {
  it("returns the registry name, which is the stock's name, for the names a proceeding is matched against", async () => {
    const names = await buildAdapter().readNames(PETROBRAS_CNPJ);

    expect(names).toStrictEqual(["PETRÓLEO BRASILEIRO S.A. - PETROBRAS"]);
  });
});
