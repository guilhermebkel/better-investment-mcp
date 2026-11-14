import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CvmProceedingsAdapter } from "@/Adapters/Cvm/CvmProceedingsAdapter.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import { ZipFixture } from "@/Testing/ZipFixture.ts";

const FIXTURES = join(import.meta.dirname, "..", "..", "Testing", "fixtures", "cvm-proceedings");
const CASES = readFileSync(join(FIXTURES, "processo_sancionador-sample.csv"), "latin1");
const DEFENDANTS = readFileSync(join(FIXTURES, "processo_sancionador_acusado-sample.csv"), "latin1");
const PETROBRAS_CNPJ = "33.000.167/0001-01";
const CURRENT_YEAR = 2026;
const NOT_USED = "not used";
const STOCK_NAME = "PETRÓLEO BRASILEIRO S.A. - PETROBRAS";
const PREVIOUS_NAME = "PETROBRAS ANTIGA S.A.";
// Why: the names are the stock's registry name and its previous legal name, as the registry reads them.
const STOCK_NAMES = [STOCK_NAME, PREVIOUS_NAME];

const buildHttp = (): HttpPort => ({
  getText: () => Promise.reject(new Error(NOT_USED)),
  getBytes: () => Promise.reject(new Error(NOT_USED)),
  postForm: () => Promise.reject(new Error(NOT_USED)),
  getCookies: () => Promise.reject(new Error(NOT_USED)),
  downloadToFile: (_url: string, filePath: string) => {
    writeFileSync(filePath, ZipFixture.buildZipOf({
      "processo_sancionador.csv": CASES,
      "processo_sancionador_acusado.csv": DEFENDANTS,
    }));
    return Promise.resolve(1);
  },
});

const buildAdapter = (names: readonly string[] = STOCK_NAMES): CvmProceedingsAdapter => new CvmProceedingsAdapter(
  buildHttp(),
  () => Promise.resolve(PETROBRAS_CNPJ),
  () => Promise.resolve(names),
  undefined,
  () => CURRENT_YEAR,
);

describe("CvmProceedingsAdapter.fetchTables()", () => {
  it("links a defendant only when its name equals the stock's name or previous name, after one normalization (AC3, AC4)", async () => {
    const result = await buildAdapter().fetchTables({ market: "BR", ticker: "PETR4", assetType: "stock" });

    const linked = result.tables.asset_proceedings?.map((row) => [row.case_number, row.defendant_name]);
    expect(linked).toStrictEqual([
      ["1001", STOCK_NAME],
      ["1002", PREVIOUS_NAME],
    ]);
  });

  it("keeps the latest status of a defendant, with its date, and the dates of the case", async () => {
    const result = await buildAdapter().fetchTables({ market: "BR", ticker: "PETR4", assetType: "stock" });

    expect(result.tables.asset_proceedings?.[0]).toMatchObject({
      asset_id: "BR:stock:PETR4",
      case_number: "1001",
      subject: "Apurar irregularidades na divulgação de informações",
      opened_time: "2024-03-04",
      current_phase: "Instrução",
      current_subphase: "Análise de defesa",
      last_movement_time: "2026-05-10",
      defendant_status: "Acusado envia proposta de Termo de Compromisso",
      defendant_status_time: "2026-02-28",
    });
  });

  it("writes no row when the company has no name to match, and reads no file", async () => {
    const result = await buildAdapter([]).fetchTables({ market: "BR", ticker: "PETR4", assetType: "stock" });

    expect(result.tables.asset_proceedings).toStrictEqual([]);
    expect(result.files).toStrictEqual([]);
  });

  it("reports a ticker with no CNPJ as unmapped", async () => {
    const adapter = new CvmProceedingsAdapter(
      buildHttp(),
      () => Promise.resolve(undefined),
      () => Promise.resolve(STOCK_NAMES),
    );

    await expect(adapter.fetchTables({ market: "BR", ticker: "XPTO3", assetType: "stock" })).rejects.toThrow("unmapped: BR:XPTO3 is pending");
  });
});
