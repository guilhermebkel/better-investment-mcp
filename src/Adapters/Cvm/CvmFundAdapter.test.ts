import { copyFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CvmFundAdapter } from "@/Adapters/Cvm/CvmFundAdapter.ts";
import { HttpFailureError } from "@/Errors/HttpFailureError.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";

const FIXTURES = join(import.meta.dirname, "..", "..", "Testing", "fixtures", "cvm-registry");
const FUND = "00.017.024/0001-53";
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

  it("writes the fund's registry from CVM's fund file", async () => {
    const adapter = new CvmFundAdapter(buildHttp(), CVM_BASE, () => NOW);

    const result = await adapter.fetchTables({ market: "FUND", ticker: FUND });

    expect(result.tables.fund_registry?.[0]).toMatchObject({ cnpj: FUND, fund_type: "FIF", net_worth: 470247.46, source: "cvm" });
  });

  it("writes the daily quota of the fund only, and the holdings of its block, with their file", async () => {
    const adapter = new CvmFundAdapter(buildHttp(), CVM_BASE, () => NOW);

    const result = await adapter.fetchTables({ market: "FUND", ticker: FUND });

    expect(result.tables.fund_daily).toStrictEqual([{
      cnpj: FUND, date: "2026-11-03", quota: 45.3607553, net_worth: 1228659.83, total_value: 1131424.27,
      subscriptions: 0, redemptions: 0, holders: 1, source: "cvm",
    }]);
    expect(result.tables.fund_holdings?.[0]).toMatchObject({
      cnpj: FUND, block: "8", asset_category: "Outros", source_file: "cda_fi_BLC_8_202610.csv", market_value: 103535.34,
    });
  });

  it("refuses a key that is not a CNPJ, without a request", async () => {
    const urls: string[] = [];
    const adapter = new CvmFundAdapter(buildHttp(urls), CVM_BASE, () => NOW);

    await expect(adapter.fetchTables({ market: "FUND", ticker: "HGLG11" })).rejects.toThrow("is not a CNPJ");
    expect(urls).toStrictEqual([]);
  });
});
