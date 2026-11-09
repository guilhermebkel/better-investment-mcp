import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { B3ListingAdapter } from "@/Adapters/B3/B3ListingAdapter.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";

const FIXTURES = join(import.meta.dirname, "..", "..", "Testing", "fixtures", "b3");
const readFixture = (name: string): string => readFileSync(join(FIXTURES, name), "utf8");
const NOT_USED = "not used";
const HGLG_CNPJ = "11.728.688/0001-47";
const EMPTY = "";

const buildHttp = (routeToAnswer: Record<string, string>, urls: string[] = []): HttpPort => ({
  getText: (url: string) => {
    urls.push(url);
    // Why: each route is answered from the recorded fixtures; a route the test does not answer returns an empty body (nothing listed).
    const route = Object.keys(routeToAnswer).find((name) => url.includes(`/${name}/`));
    return Promise.resolve(route === undefined ? EMPTY : (routeToAnswer[route] ?? EMPTY));
  },
  getBytes: () => Promise.reject(new Error(NOT_USED)),
  postForm: () => Promise.reject(new Error(NOT_USED)),
  downloadToFile: () => Promise.reject(new Error("not used")),
  getCookies: () => Promise.reject(new Error(NOT_USED)),
});

const FUND_ANSWERS = {
  [B3ListingAdapter.FUND_LIST]: readFixture("fund-list-hglg11.json"),
  [B3ListingAdapter.FUND_DETAIL]: readFixture("fund-detail-hglg.json"),
};
const STOCK_ANSWERS = {
  [B3ListingAdapter.COMPANY_LIST]: readFixture("company-list-vale3.json"),
  [B3ListingAdapter.COMPANY_DETAIL]: readFixture("company-detail-4170.json"),
};

describe("B3ListingAdapter.fetchTables()", () => {
  it("resolves a FII from its listing and checks the detail lists the ticker asked", async () => {
    const adapter = new B3ListingAdapter(buildHttp(FUND_ANSWERS));

    const result = await adapter.fetchTables({ market: "BR", ticker: "HGLG11", assetType: "fii" });

    expect(result.tables.asset_identifiers).toStrictEqual([
      { market: "BR", ticker: "HGLG11", asset_type: "fii", legal_id: HGLG_CNPJ, isin: null,
        company_name: "PÁTRIA LOG - FUNDO DE INVESTIMENTO IMOBILIÁRIO - RESPONSABILIDADE LIMITADA", source: "b3" },
    ]);
  });

  it("accepts a ticker that is one of the other codes of the fund (HGLG13)", async () => {
    const adapter = new B3ListingAdapter(buildHttp(FUND_ANSWERS));

    const result = await adapter.fetchTables({ market: "BR", ticker: "HGLG13", assetType: "fii" });

    expect(result.tables.asset_identifiers?.[0]).toMatchObject({ ticker: "HGLG13", legal_id: HGLG_CNPJ });
  });

  it("refuses a FII whose detail does not list the ticker, and writes nothing", async () => {
    const adapter = new B3ListingAdapter(buildHttp(FUND_ANSWERS));

    await expect(adapter.fetchTables({ market: "BR", ticker: "HGLG99", assetType: "fii" })).rejects.toThrow(
      "B3 has no fii with the ticker HGLG99; no identifier was written",
    );
  });

  it("reads a stock's ISIN and CNPJ from the detail of its issuer", async () => {
    const adapter = new B3ListingAdapter(buildHttp(STOCK_ANSWERS));

    const result = await adapter.fetchTables({ market: "BR", ticker: "VALE3", assetType: "stock" });

    expect(result.tables.asset_identifiers?.[0]).toMatchObject({
      ticker: "VALE3", asset_type: "stock", legal_id: "33.592.510/0001-54", isin: "BRVALEACNOR0",
    });
  });

  it("filters the listing before the detail: a listing that is empty asks for no detail", async () => {
    const urls: string[] = [];
    const adapter = new B3ListingAdapter(buildHttp({}, urls));

    await expect(adapter.findFund("XPTO11")).resolves.toBeUndefined();
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain(B3ListingAdapter.FUND_LIST);
  });

  it("formats a CNPJ as CVM writes it", () => {
    expect(B3ListingAdapter.formatCnpj("11728688000147")).toBe("11.728.688/0001-47");
  });
});
