import { copyFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CvmDisclosureAdapter } from "@/Adapters/Cvm/CvmDisclosureAdapter.ts";
import { HttpFailureError } from "@/Errors/HttpFailureError.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";

const FIXTURE = join(import.meta.dirname, "..", "..", "Testing", "fixtures", "cvm-registry", "fre-sample-2024.zip");
const BASE = "https://dados.cvm.gov.br";
const RECORDED_URL = `${BASE}/dados/CIA_ABERTA/DOC/FRE/DADOS/fre_cia_aberta_2024.zip`;
const PETROBRAS = "33.000.167/0001-01";
const CURRENT_YEAR = 2026;
const NOT_FOUND = 404;
const NOT_USED = "not used";
const REFERENCE_DATE = "2024-12-31";

const buildHttp = (urls: string[] = []): HttpPort => ({
  // Why: only the recorded FRE year is served; any other URL answers 404, as CVM does for a year it does not publish.
  getText: () => Promise.reject(new Error(NOT_USED)),
  getBytes: () => Promise.reject(new Error(NOT_USED)),
  postForm: () => Promise.reject(new Error(NOT_USED)),
  getCookies: () => Promise.reject(new Error(NOT_USED)),
  downloadToFile: (url: string, filePath: string) => {
    urls.push(url);
    if (url !== RECORDED_URL) {
      return Promise.reject(new HttpFailureError("the vendor answered with status 404", NOT_FOUND));
    }
    copyFileSync(FIXTURE, filePath);
    return Promise.resolve(1);
  },
});

describe("CvmDisclosureAdapter.fetchTables()", () => {
  it("keeps only the rows of the company, each with its section, date, version and document", async () => {
    const adapter = new CvmDisclosureAdapter(buildHttp(), () => Promise.resolve(PETROBRAS), BASE, () => CURRENT_YEAR);

    const result = await adapter.fetchTables({ market: "BR", ticker: "PETR4", assetType: "stock" });
    const rows = result.tables.asset_filing_items ?? [];

    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.section)).toStrictEqual(["principal", "posicao_acionaria", "posicao_acionaria"]);
    expect(rows[1]).toMatchObject({ asset_id: "BR:stock:PETR4", filing_id: "fre:BR:stock:PETR4:555", section: "posicao_acionaria" });
    const document = (result.tables.asset_filings ?? []).find((row) => row.filing_id === "fre:BR:stock:PETR4:555");
    expect(document).toMatchObject({
      document_type: "fre", reference_time_start: REFERENCE_DATE, reference_time_end: REFERENCE_DATE, version: 1,
      source_file: "fre_cia_aberta_posicao_acionaria_2024.csv",
    });
    expect(document).not.toHaveProperty("source");
    const json = String(rows[1]?.row_json);
    expect(JSON.parse(json)).toMatchObject({ Acionista: "UNIAO FEDERAL", Percentual: "36.0" });
  });

  it("asks for the three datasets of each year of the default window", async () => {
    const urls: string[] = [];
    const http = buildHttp(urls);
    const adapter = new CvmDisclosureAdapter(http, () => Promise.resolve(PETROBRAS), BASE, () => CURRENT_YEAR);

    await adapter.fetchTables({ market: "BR", ticker: "PETR4", assetType: "stock" });

    expect(urls).toHaveLength(9);
    expect(urls).toContain(`${BASE}/dados/CIA_ABERTA/DOC/VLMO/DADOS/vlmo_cia_aberta_2025.zip`);
  });

  it("takes the document link from its main section, even when an earlier section of it has none", () => {
    const link = "http://www.rad.cvm.gov.br/ENETCONSULTA/frmDownloadDocumento.aspx?CodigoInstituicao=1&NumeroSequencialDocumento=138733";
    const assetId = "BR:stock:PETR4";
    const dataset = "fre";
    const documentId = "138733";
    const tables = CvmDisclosureAdapter.buildTables([
      { asset_id: assetId, dataset: dataset, section: "posicao_acionaria", reference_date: REFERENCE_DATE, version: "1", document_id: documentId, row_json: "{}", source_file: "posicao.csv", link: null },
      { asset_id: assetId, dataset: dataset, section: "principal", reference_date: REFERENCE_DATE, version: "1", document_id: documentId, row_json: "{}", source_file: "principal.csv", link },
    ]);

    expect(tables.asset_filings).toHaveLength(1);
    expect(tables.asset_filings?.[0]).toMatchObject({ filing_id: `${dataset}:${assetId}:${documentId}`, url: link });
  });

  it("reports a ticker with no CNPJ as pending", async () => {
    const adapter = new CvmDisclosureAdapter(buildHttp(), () => Promise.resolve(undefined), BASE, () => CURRENT_YEAR);

    await expect(adapter.fetchTables({ market: "BR", ticker: "XPTO3", assetType: "stock" })).rejects.toThrow("unmapped: BR:XPTO3");
  });
});
