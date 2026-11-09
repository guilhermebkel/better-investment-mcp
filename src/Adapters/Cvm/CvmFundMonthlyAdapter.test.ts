import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CvmFundMonthlyAdapter } from "@/Adapters/Cvm/CvmFundMonthlyAdapter.ts";
import { CvmFailureError } from "@/Errors/CvmFailureError.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import type { ProviderRequest, ProviderResult } from "@/Protocols/ProviderProtocol.ts";
import { FakeHttp } from "@/Testing/FakeHttp.ts";
import { ZipFixture } from "@/Testing/ZipFixture.ts";

type PeriodRange = {
  from: string; to: string;
};

const FIXTURES = join(import.meta.dirname, "..", "..", "Testing", "fixtures", "cvm");
const COMPLEMENT = readFileSync(join(FIXTURES, "recorded-inf-mensal-fii-complemento-2025-irdm11-sample.csv"), "latin1");
const ASSET_LIABILITY = readFileSync(join(FIXTURES, "recorded-inf-mensal-fii-ativo_passivo-2025-irdm11-sample.csv"), "latin1");
const CVM_HOST = "https://dados.cvm.gov.br";
const ZIP_URL = "https://dados.cvm.gov.br/dados/FII/DOC/INF_MENSAL/DADOS/inf_mensal_fii_2025.zip";
const IRDM_FUND = "28.830.325/0001-10";
const CURRENT_YEAR = 2025;
const YEAR_START = "2025-01-01";
const JANUARY_START = YEAR_START;
const JANUARY_END = "2025-01-31";
const JANUARY: PeriodRange = { from: JANUARY_START, to: JANUARY_END };
const MARCH_START = "2025-03-01";
const MARCH_TO_APRIL: PeriodRange = { from: MARCH_START, to: "2025-04-30" };
const MARCH: PeriodRange = { from: MARCH_START, to: "2025-03-31" };
const FULL_YEAR: PeriodRange = { from: YEAR_START, to: "2025-12-31" };
const IRDM_KEY = { market: "BR", ticker: "IRDM11", assetType: "fii" };
const NET_WORTH = "fii.net_worth";

const buildFundZip = (
  complement: string = COMPLEMENT,
  assetLiability: string = ASSET_LIABILITY,
): Uint8Array => ZipFixture.buildZipOf({
  "inf_mensal_fii_complemento_2025.csv": complement,
  "inf_mensal_fii_ativo_passivo_2025.csv": assetLiability,
});

const buildLookup = (cnpj: string | undefined) => (): Promise<string | undefined> => Promise.resolve(cnpj);

const buildAdapter = (http: HttpPort, cnpj: string | undefined): CvmFundMonthlyAdapter => new CvmFundMonthlyAdapter(
  http,
  buildLookup(cnpj),
  CVM_HOST,
  () => CURRENT_YEAR,
);
const fetchRequest = (period: PeriodRange): ProviderRequest => ({ ...IRDM_KEY, period });
const fetchFundTables = (http: HttpPort, cnpj: string | undefined, period: PeriodRange): Promise<ProviderResult> => {
  return buildAdapter(http, cnpj).fetchTables(fetchRequest(period));
};

describe("CvmFundMonthlyAdapter.fetchTables()", () => {
  // Why: a monthly figure is one metric row per column and month, named fii.<column>; the asset is the FII's ticker.
  const ASSET_ID = "BR:fii:IRDM11";
  const readMetrics = (result: ProviderResult): Record<string, unknown>[] => result.tables.asset_metrics ?? [];
  const readValueAt = (result: ProviderResult, metric: string, month: string): Record<string, unknown> | undefined => {
    return readMetrics(result).find((row) => row.metric === metric && row.reference_time_start === month);
  };
  const readMonths = (result: ProviderResult): string[] => {
    const starts = readMetrics(result).map((row) => String(row.reference_time_start));
    return [...new Set(starts)].sort();
  };

  it("fills one metric row per column and reference month, with net worth and liquidity from CVM's own files (AC2)", async () => {
    const { http, urls } = FakeHttp.buildServing({ [ZIP_URL]: buildFundZip() });
    const result = await fetchFundTables(http, IRDM_FUND, FULL_YEAR);

    expect(urls).toStrictEqual([ZIP_URL]);
    const found1 = readMonths(result);
    expect(found1).toHaveLength(10);
    const found2 = readValueAt(result, NET_WORTH, YEAR_START);
    expect(found2).toMatchObject({
      asset_id: ASSET_ID, reference_time_end: "2025-01-31", value: 2978739725.87, unit: "brl", version: 1,
    });
    const found3 = readValueAt(result, "fii.liquidity_requirement", YEAR_START);
    expect(found3).toMatchObject({ value: 107746129.09, unit: "brl" });
    const found4 = readValueAt(result, "fii.cash_available", YEAR_START);
    expect(found4).toMatchObject({ value: 0 });
  });

  it("keeps the later version of a month that CVM restated, with the version it came from (AC2)", async () => {
    const { http } = FakeHttp.buildServing({ [ZIP_URL]: buildFundZip() });
    const result = await fetchFundTables(http, IRDM_FUND, FULL_YEAR);

    const found5 = readValueAt(result, NET_WORTH, "2025-10-01");
    expect(found5).toMatchObject({ version: 2, value: 2959621783.69 });
    const found6 = readValueAt(result, "fii.liquidity_requirement", "2025-10-01");
    expect(found6).toMatchObject({ version: 2, value: 101256466.54 });
  });

  it("keeps a value the file leaves empty as null, never as zero", async () => {
    const emptyNetWorth = COMPLEMENT.replace("2978739725.87", "");
    const { http } = FakeHttp.buildServing({ [ZIP_URL]: buildFundZip(emptyNetWorth) });
    const result = await fetchFundTables(http, IRDM_FUND, JANUARY);

    const found7 = readValueAt(result, NET_WORTH, JANUARY_START);
    expect(found7).toMatchObject({ value: null });
  });

  it("leaves out the fields CVM does not carry, so the distribution per unit is absent and not invented (P4)", async () => {
    const { http } = FakeHttp.buildServing({ [ZIP_URL]: buildFundZip() });
    const result = await fetchFundTables(http, IRDM_FUND, MARCH);
    const names = readMetrics(result).map((row) => row.metric);

    expect(names).not.toContain("fii.distribution_per_unit");
    expect(names).not.toContain("fii.total_revenue");
  });

  it("keeps only the months inside the period", async () => {
    const { http } = FakeHttp.buildServing({ [ZIP_URL]: buildFundZip() });
    const result = await fetchFundTables(http, IRDM_FUND, MARCH_TO_APRIL);

    const found8 = readMonths(result);
    expect(found8).toStrictEqual(["2025-03-01", "2025-04-01"]);
  });

  it("keeps the rows of the fund's own CNPJ only, so another fund's figures never reach this ticker", async () => {
    const { http } = FakeHttp.buildServing({ [ZIP_URL]: buildFundZip() });
    const result = await fetchFundTables(http, "41.076.564/0001-95", FULL_YEAR);

    expect(result.tables.asset_metrics).toStrictEqual([]);
  });

  it("names the ticker as pending when no CNPJ is known, and reads no file (AC8)", async () => {
    const { http, urls } = FakeHttp.buildServing({ [ZIP_URL]: buildFundZip() });
    const attempt = fetchFundTables(http, undefined, FULL_YEAR);
    await expect(attempt).rejects.toThrow(CvmFailureError);
    await expect(attempt).rejects.toThrow("unmapped: BR:IRDM11 is pending");
    expect(urls).toStrictEqual([]);
  });

  it("stops the load when a balance file has lost a column it reads, and writes nothing", async () => {
    const changedHeader = ASSET_LIABILITY.replace("Disponibilidades", "Disponibilidade_Caixa");
    const { http } = FakeHttp.buildServing({ [ZIP_URL]: buildFundZip(COMPLEMENT, changedHeader) });
    const attempt = fetchFundTables(http, IRDM_FUND, FULL_YEAR);
    await expect(attempt)
      .rejects.toThrow("the column Disponibilidades is missing");
  });

  it("refuses a request whose lookup failed with a CVM failure class, not a guess", async () => {
    const http: HttpPort = {
      getText: () => Promise.reject(new Error("not used")),
      postForm: () => Promise.reject(new Error("not used")),
      getCookies: () => Promise.reject(new Error("not used")),
      getBytes: () => Promise.reject(new Error("socket hang up")),
      downloadToFile: () => Promise.reject(new Error("socket hang up")),
    };
    const attempt = fetchFundTables(http, IRDM_FUND, FULL_YEAR);
    await expect(attempt)
      .rejects.toThrow("CVM: file could not be read: socket hang up");
  });
});
