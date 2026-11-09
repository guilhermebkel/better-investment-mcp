import { copyFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CvmFundAdapter } from "@/Adapters/Cvm/CvmFundAdapter.ts";
import { HttpFailureError } from "@/Errors/HttpFailureError.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";

const FIXTURES = join(import.meta.dirname, "..", "..", "Testing", "fixtures", "cvm-registry");
const FUND = "00.017.024/0001-53";
const DAY_2026_11_03 = "2026-11-03";
const NOT_FOUND = 404;
const NOT_USED = "not used";
const NOW = new Date(Date.UTC(2026, 11, 15));
const CVM_BASE = "https://dados.cvm.gov.br";
const suffixToFixture: Readonly<Record<"cad_fi.csv" | "inf_diario_fi_202611.zip" | "cda_fi_202610.zip", string>> = {
  "cad_fi.csv": "cad_fi-sample.csv",
  "inf_diario_fi_202611.zip": "fund-inf-diario-202611.zip",
  "cda_fi_202610.zip": "fund-cda-202610.zip",
};

const buildHttp = (urls: string[] = []): HttpPort => ({
  getText: () => Promise.reject(new Error(NOT_USED)),
  getBytes: () => Promise.reject(new Error(NOT_USED)),
  postForm: () => Promise.reject(new Error(NOT_USED)),
  getCookies: () => Promise.reject(new Error(NOT_USED)),
  downloadToFile: (url: string, filePath: string) => {
    // Why: each CVM file is answered from its recorded fixture; a month not recorded answers 404, as CVM does for a month not yet published.
    urls.push(url);
    const suffixes = Object.keys(suffixToFixture) as (keyof typeof suffixToFixture)[];
    const suffix = suffixes.find((name) => url.endsWith(name));
    const fixture = suffix === undefined ? undefined : suffixToFixture[suffix];
    if (fixture === undefined) {
      return Promise.reject(new HttpFailureError("the vendor answered with status 404", NOT_FOUND));
    }
    copyFileSync(join(FIXTURES, fixture), filePath);
    return Promise.resolve(1);
  },
});

describe("CvmFundAdapter.fetchTables()", () => {
  it("asks for the last twelve months before the current one", () => {
    expect(CvmFundAdapter.listRecentMonths(NOW, 3)).toStrictEqual(["202609", "202610", "202611"]);
  });

  it("writes the fund's registry from CVM's fund file: the asset, its attributes and its net worth", async () => {
    const adapter = new CvmFundAdapter(buildHttp(), CVM_BASE, () => NOW);

    const result = await adapter.fetchTables({ market: "BR", assetType: "fund", ticker: FUND });

    expect(result.tables.asset?.[0]).toMatchObject({ asset_id: `BR:fund:${FUND}`, market: "BR", asset_type: "fund", code: FUND });
    expect(result.tables.asset_attribute).toContainEqual({ asset_id: `BR:fund:${FUND}`, attribute: "fund_type", value: "FIF" });
    expect(result.tables.asset_metrics).toContainEqual(expect.objectContaining({ metric: "fund.net_worth", value: 470247.46, unit: "brl" }));
  });

  it("writes the daily figures of the fund as one metric row each, with the unit of each, and the holdings of its block", async () => {
    const adapter = new CvmFundAdapter(buildHttp(), CVM_BASE, () => NOW);

    const result = await adapter.fetchTables({ market: "BR", assetType: "fund", ticker: FUND });
    const readDayMetric = (metric: string): unknown => (result.tables.asset_metrics ?? [])
      .find((row) => row.metric === metric && row.reference_time_start === DAY_2026_11_03);

    expect(readDayMetric("fund.quota")).toStrictEqual({ asset_id: `BR:fund:${FUND}`, metric: "fund.quota", reference_time_start: DAY_2026_11_03, reference_time_end: DAY_2026_11_03, value: 45.3607553, unit: "brl_per_quota" });
    expect(readDayMetric("fund.net_worth")).toMatchObject({ value: 1228659.83, unit: "brl" });
    expect(readDayMetric("fund.holders")).toMatchObject({ value: 1, unit: "count" });
    expect(result.tables.asset_holdings?.[0]).toMatchObject({
      asset_id: `BR:fund:${FUND}`, block: "8", application_type: "Disponibilidades", market_value: 103535.34,
    });
    expect(result.tables.asset_holdings?.[0]).not.toHaveProperty("source_file");
  });

  it("refuses a key that is not a CNPJ, without a request", async () => {
    const urls: string[] = [];
    const adapter = new CvmFundAdapter(buildHttp(urls), CVM_BASE, () => NOW);

    await expect(adapter.fetchTables({ market: "BR", assetType: "fund", ticker: "HGLG11" })).rejects.toThrow("is not a CNPJ");
    expect(urls).toStrictEqual([]);
  });
});
