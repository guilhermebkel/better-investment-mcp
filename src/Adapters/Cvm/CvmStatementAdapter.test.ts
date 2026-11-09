import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CvmAdapter } from "@/Adapters/Cvm/CvmAdapter.ts";
import { CvmStatementAdapter } from "@/Adapters/Cvm/CvmStatementAdapter.ts";
import type { CvmKey, CvmStatementCandidate, CvmStatementScan, StatementSource } from "@/Protocols/CvmProtocol.ts";
import { FakeHttp } from "@/Testing/FakeHttp.ts";
import { ZipFixture } from "@/Testing/ZipFixture.ts";

const DRE_SAMPLE_PATH = join(import.meta.dirname, "..", "..", "Testing", "fixtures", "cvm", "statements-dre-sample.csv");
const DRE_SAMPLE = readFileSync(DRE_SAMPLE_PATH, "latin1");
const HEADER = DRE_SAMPLE.split("\n")[0] ?? "";
const SAMPLE_CNPJ = "12.345.678/0001-90";
const CNPJ_DIGITS = "12345678000190";
const CURRENT_YEAR = 2025;
const BASE = "https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC";
const QUARTER_END = "2025-03-31";
const YEAR_START = "2025-01-01";
const FILING_MAY = "2025-05-15";
const REVENUE_LINE = "3.01 Receita de Venda";
const DRE_CON = "DRE_con";
const STATEMENTS = ["DRE_con", "DRE_ind", "BPA_con", "BPA_ind", "BPP_con", "BPP_ind", "DFC_MD_con", "DFC_MD_ind"];
const CANDIDATE_KEY = "DRE_con||2025-03-31|3.01";
const DRE_FILE = "itr_cia_aberta_DRE_con_2025.csv";
const DRE_SOURCE: StatementSource = { statement: DRE_CON, sourceFile: DRE_FILE };
const Q1_2024 = "2024-03-31";
const WINDOW_FROM = "2023-01-01";
const YEAR_END = "2025-12-31";
const WINDOW_TO = YEAR_END;
const WINDOW_YEARS = { from: WINDOW_FROM, to: WINDOW_TO };
const key: CvmKey = { market: "BR", ticker: "EXPL3", asset_type: "stock" };
const request = { market: "BR", ticker: "EXPL3", assetType: "stock" };
const resolveSampleCompany = () => Promise.resolve(SAMPLE_CNPJ);

const buildScan = (): CvmStatementScan => ({
  key,
  cnpjDigits: CNPJ_DIGITS,
  window: WINDOW_YEARS,
  keyToCandidate: new Map(),
  files: [],
});

const readAll = (text: string, source: StatementSource): CvmStatementCandidate[] => {
  const [header = "", ...lines] = text.split(/\r?\n/u);
  const columns = CvmStatementAdapter.readColumns(header);
  const scan = buildScan();
  return lines
    .map((line) => CvmStatementAdapter.readCandidate(line, columns, source, scan))
    .filter((candidate) => candidate !== undefined);
};

const buildCandidate = (referenceDate: string, version: number, value: number): CvmStatementCandidate => ({
  referenceDate,
  version,
  periodEnd: QUARTER_END,
  key: CANDIDATE_KEY,
  row: { ...key, period_end: QUARTER_END, value },
});

describe("CvmStatementAdapter.readCandidate()", () => {
  it("keeps the company's lines in currency units, with the statement, the period and the line item (AC1, AC4)", () => {
    const rows = readAll(DRE_SAMPLE, DRE_SOURCE).map((candidate) => candidate.row);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toStrictEqual({
      market: "BR",
      ticker: "EXPL3",
      asset_type: "stock",
      period_end: QUARTER_END,
      period_type: "quarter",
      statement: DRE_CON,
      line_item: REVENUE_LINE,
      value: 1_500_000,
      currency: "BRL",
      source: "cvm",
      version: 1,
      source_file: DRE_FILE,
    });
    expect(rows.map((row) => row.period_type)).toStrictEqual(["quarter", "quarter", "ytd"]);
  });

  it("leaves out a line with no value, so a missing period is absent and not zero (AC5)", () => {
    const lineItems = readAll(DRE_SAMPLE, DRE_SOURCE).map((candidate) => candidate.row.line_item);
    expect(lineItems).not.toContain("3.11 Lucro Liquido do Periodo");
  });

  it("reads a balance sheet, which has no start date, as an instant, and keeps a unit scale as it is", () => {
    const balance = [
      "CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;GRUPO_DFP;MOEDA;ESCALA_MOEDA;ORDEM_EXERC;DT_FIM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA;ST_CONTA_FIXA",
      "12.345.678/0001-90;2025-03-31;1;EMPRESA EXEMPLO S.A.;009999;DF Consolidado - Balanco;REAL;UNIDADE;ULTIMO;2025-03-31;1;Ativo Total;250.0000000000;S",
    ].join("\n");
    const [candidate] = readAll(balance, { statement: "BPA_con", sourceFile: "itr_cia_aberta_BPA_con_2025.csv" });
    expect(candidate?.row).toMatchObject({ period_type: "instant", value: 250, statement: "BPA_con" });
  });

  it("does not keep the lines of other companies", () => {
    const rows = readAll(DRE_SAMPLE, DRE_SOURCE).map((candidate) => candidate.row);
    expect(rows.some((row) => row.value === 999_000)).toBe(false);
  });

  it("fails when the scale of a line is not known", () => {
    const text = [HEADER, "12.345.678/0001-90;2025-03-31;1;E;9;G;REAL;CENTENA;ULTIMO;2025-01-01;2025-03-31;3.01;R;1.0;S"].join("\n");
    expect(() => readAll(text, DRE_SOURCE)).toThrow("the scale CENTENA is unknown");
  });

  it("fails when a value is not a number", () => {
    const text = [HEADER, "12.345.678/0001-90;2025-03-31;1;E;9;G;REAL;MIL;ULTIMO;2025-01-01;2025-03-31;3.01;R;abc;S"].join("\n");
    expect(() => readAll(text, DRE_SOURCE)).toThrow("a value is not a number");
  });

  it("fails with a format-changed message when a needed column is missing", () => {
    expect(() => CvmStatementAdapter.readColumns("CNPJ_CIA;DT_REFER")).toThrow("the column VERSAO is missing");
  });
});

describe("CvmStatementAdapter.readPeriodType()", () => {
  it.each([
    ["", QUARTER_END, "instant"],
    [YEAR_START, QUARTER_END, "quarter"],
    [YEAR_START, "2025-06-30", "ytd"],
    [YEAR_START, YEAR_END, "year"],
  ])("reads start %s and end %s as %s", (startDate, endDate, expected) => {
    expect(CvmStatementAdapter.readPeriodType(startDate, endDate)).toBe(expected);
  });
});

describe("CvmStatementAdapter.keepLatest()", () => {
  it("keeps the later filing when a period is restated, whatever the order they arrive in (AC2)", () => {
    const keyToCandidate = new Map<string, CvmStatementCandidate>();
    const original = buildCandidate(FILING_MAY, 1, 1);
    const restated = buildCandidate("2025-08-14", 1, 2);
    const stale = buildCandidate(FILING_MAY, 1, 3);
    for (const candidate of [restated, original, stale]) {
      CvmStatementAdapter.keepLatest(keyToCandidate, candidate);
    }
    expect(keyToCandidate.get(CANDIDATE_KEY)?.row.value).toBe(2);
  });

  it("keeps the higher version when two versions come from the same filing date", () => {
    const keyToCandidate = new Map<string, CvmStatementCandidate>();
    const first = buildCandidate(FILING_MAY, 1, 1);
    const second = buildCandidate(FILING_MAY, 2, 9);
    for (const candidate of [first, second]) {
      CvmStatementAdapter.keepLatest(keyToCandidate, candidate);
    }
    expect(keyToCandidate.get(CANDIDATE_KEY)?.row.value).toBe(9);
  });
});

describe("CvmStatementAdapter.fetchTables()", () => {
  it("reads the ITR and DFP files, each with the eight statements, and fills financial_statements (AC1)", async () => {
    const entries = STATEMENTS.map((statement): [string, string] => [
      `itr_cia_aberta_${statement}_${CURRENT_YEAR}.csv`,
      DRE_SAMPLE,
    ]);
    const itrZip = ZipFixture.buildZipOf(Object.fromEntries(entries));
    const { http, urls } = FakeHttp.buildServing({ [`${BASE}/ITR/DADOS/itr_cia_aberta_2025.zip`]: itrZip });
    const result = await new CvmStatementAdapter(http, resolveSampleCompany, CvmAdapter.BASE_URL, () => CURRENT_YEAR)
      .fetchTables(request);

    expect(urls).toHaveLength(6);
    expect(urls[0]).toBe(`${BASE}/ITR/DADOS/itr_cia_aberta_2023.zip`);
    expect(result.source).toBe("cvm");
    const rows = result.tables.asset_metrics ?? [];
    // Why: a metric is statement.<statement>.<code>; the statement is the second word, in lower case.
    const statements = rows.map((row) => String(row.metric).split(".")[1]);
    expect(new Set(statements)).toStrictEqual(new Set(STATEMENTS.map((name) => name.toLowerCase())));
    // Why: each statement file has three company lines (two quarters and a year to date), so eight files give 24 rows.
    expect(rows).toHaveLength(24);
  });

  it("stops the load when one statement file of a year is missing, and writes nothing", async () => {
    const itrZip = ZipFixture.buildZipOf({ "itr_cia_aberta_DRE_con_2025.csv": DRE_SAMPLE });
    const { http } = FakeHttp.buildServing({ [`${BASE}/ITR/DADOS/itr_cia_aberta_2025.zip`]: itrZip });
    const attempt = new CvmStatementAdapter(http, resolveSampleCompany, CvmAdapter.BASE_URL, () => CURRENT_YEAR)
      .fetchTables(request);
    await expect(attempt).rejects.toThrow("has no entry itr_cia_aberta_DRE_ind_2025.csv");
  });

  it("names the ticker as pending when it cannot be mapped to a company (AC8)", async () => {
    const { http } = FakeHttp.buildServing({});
    await expect(new CvmStatementAdapter(http, () => Promise.resolve(undefined)).fetchTables(request))
      .rejects.toThrow("unmapped: BR:EXPL3 is pending");
  });

  it("loads the years of the period only and keeps the rows whose period end is inside it (AC1, AC4)", async () => {
    const itrUrl = `${BASE}/ITR/DADOS/itr_cia_aberta_2024.zip`;
    const entries = STATEMENTS.map((statement): [string, string] => [`itr_cia_aberta_${statement}_2024.csv`, DRE_SAMPLE]);
    const { http, urls } = FakeHttp.buildServing({ [itrUrl]: ZipFixture.buildZipOf(Object.fromEntries(entries)) });
    const result = await new CvmStatementAdapter(http, resolveSampleCompany, CvmAdapter.BASE_URL, () => CURRENT_YEAR)
      .fetchTables({ ...request, period: { from: Q1_2024, to: Q1_2024 } });
    expect(urls).toStrictEqual([itrUrl, `${BASE}/DFP/DADOS/dfp_cia_aberta_2024.zip`]);
    const rows = result.tables.asset_metrics ?? [];
    // Why: the sample's 2024 comparative quarter is the only line inside the period; the 2025 lines are outside it and are not kept.
    expect(rows.map((row) => row.reference_time_end)).toStrictEqual(Array.from({ length: STATEMENTS.length }, () => "2024-03-31"));
  });

  it("records each statement file that it read, with its hash, for the version history (S4)", async () => {
    const url = `${BASE}/ITR/DADOS/itr_cia_aberta_2025.zip`;
    const entries = STATEMENTS.map((statement): [string, string] => [`itr_cia_aberta_${statement}_2025.csv`, DRE_SAMPLE]);
    const itrZip = ZipFixture.buildZipOf(Object.fromEntries(entries));
    const { http } = FakeHttp.buildServing({ [url]: itrZip });
    const result = await new CvmStatementAdapter(http, resolveSampleCompany, CvmAdapter.BASE_URL, () => CURRENT_YEAR)
      .fetchTables({ ...request, period: { from: "2025-01-01", to: YEAR_END } });
    expect(result.files).toStrictEqual([{
      url,
      dataset: "cia_aberta-doc-itr",
      referenceYear: 2025,
      sha256: createHash("sha256").update(itrZip).digest("hex"),
      sizeBytes: itrZip.byteLength,
    }]);
  });
});
