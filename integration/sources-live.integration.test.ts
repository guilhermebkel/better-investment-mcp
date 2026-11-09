import { describe, expect, it } from "vitest";
import { B3ListingAdapter } from "@/Adapters/B3/B3ListingAdapter.ts";
import { BcbPtaxAdapter } from "@/Adapters/Bcb/BcbPtaxAdapter.ts";
import { HttpAdapter } from "@/Adapters/Http/HttpAdapter.ts";
import { CvmAdapter } from "@/Adapters/Cvm/CvmAdapter.ts";
import { CvmFundAdapter } from "@/Adapters/Cvm/CvmFundAdapter.ts";
import { CvmDisclosureAdapter } from "@/Adapters/Cvm/CvmDisclosureAdapter.ts";
import { CvmRegistryAdapter } from "@/Adapters/Cvm/CvmRegistryAdapter.ts";
import { CvmTickerAdapter } from "@/Adapters/Cvm/CvmTickerAdapter.ts";
import { YfinanceAdapter } from "@/Adapters/Yfinance/YfinanceAdapter.ts";

// Why: this contract reaches the live B3, BCB Olinda and CVM services, so it runs with `pnpm test:integration` and never in `pnpm test`; it proves the paths and the shapes the adapters read still match the services.
const BR = "BR";
const TIMEOUT_MS = 600_000;
const MIN_FX_DAYS = 100;
const MIN_HISTORY_DAYS = 1000;
const MIN_SELL_RATE = 1;
const FUND_CNPJ = "00.017.024/0001-53";
const PETROBRAS_CNPJ = "33.000.167/0001-01";
const B3_FII_TICKERS = ["HGLG11", "IRIM11"] as const;

describe("B3ListingAdapter against the live service", () => {
  it("resolves the CNPJ of a FII from its listing and detail", async () => {
    const http = new HttpAdapter({ allowedHosts: [B3ListingAdapter.HOST] });
    const adapter = new B3ListingAdapter(http);

    for (const ticker of B3_FII_TICKERS) {
      const result = await adapter.fetchTables({ assetType: "fii", market: BR, ticker });
      expect(result.tables.asset?.[0]).toMatchObject({ asset_type: "fii", code: ticker });
      expect(result.tables.asset?.[0]?.legal_id).toMatch(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/u);
    }
  }, TIMEOUT_MS);

  it("resolves the ISIN and CNPJ of a stock from its issuer's detail", async () => {
    const http = new HttpAdapter({ allowedHosts: [B3ListingAdapter.HOST] });
    const adapter = new B3ListingAdapter(http);

    const result = await adapter.fetchTables({ market: BR, ticker: "VALE3", assetType: "stock" });

    expect(result.tables.asset?.[0]).toMatchObject({ code: "VALE3", legal_id: "33.592.510/0001-54" });
    expect(String(result.tables.asset?.[0]?.isin)).toMatch(/^BR[A-Z0-9]{10}$/u);
  }, TIMEOUT_MS);
});

describe("BcbPtaxAdapter against the live service", () => {
  it("returns the closing rate of USD for the current year", async () => {
    const http = new HttpAdapter({ allowedHosts: ["olinda.bcb.gov.br"] });
    const adapter = new BcbPtaxAdapter(http);

    const result = await adapter.fetchTables({ market: BR, assetType: "currency", ticker: "USD" });
    const rows = (result.tables.asset_metrics ?? []).filter((row) => row.metric === "fx.sell_rate");

    expect(rows.length).toBeGreaterThan(MIN_FX_DAYS);
    expect(rows.every((row) => typeof row.value === "number" && row.value > MIN_SELL_RATE)).toBe(true);
  }, TIMEOUT_MS);
});

const buildCvmHttp = (): HttpAdapter => new HttpAdapter({
  allowedHosts: [CvmAdapter.HOST],
  maxBytes: CvmAdapter.MAX_FILE_BYTES,
  timeoutMs: TIMEOUT_MS,
});

describe("CVM registry and fund adapters against the live files", () => {
  it("writes the company registry of Petrobras with its sector", async () => {
    const http = buildCvmHttp();
    const adapter = new CvmRegistryAdapter(http, () => Promise.resolve(PETROBRAS_CNPJ));

    const result = await adapter.fetchTables({ market: BR, ticker: "PETR4", assetType: "stock" });

    expect(result.tables.asset?.[0]).toMatchObject({ legal_id: PETROBRAS_CNPJ, sector: "Petróleo e Gás" });
  }, TIMEOUT_MS);

  it("writes a fund's registry and its monthly rows from the last twelve months", async () => {
    const http = buildCvmHttp();
    const adapter = new CvmFundAdapter(http);

    const result = await adapter.fetchTables({ market: BR, assetType: "fund", ticker: FUND_CNPJ });

    expect(result.tables.asset?.length).toBe(1);
    expect((result.tables.asset_metrics ?? []).filter((row) => row.metric === "fund.quota").length).toBeGreaterThan(0);
    expect(result.tables.asset_holdings?.length).toBeGreaterThan(0);
  }, TIMEOUT_MS);

  it("keeps the ticker lookup of CVM's company list reachable", async () => {
    const http = buildCvmHttp();
    const lookup = new CvmTickerAdapter(http);

    await expect(lookup.resolveCnpj(BR, "PETR4")).resolves.toBe(PETROBRAS_CNPJ);
  }, TIMEOUT_MS);
});

describe("YfinanceAdapter against the live library", () => {
  it("returns the price history and the name of PETR4", async () => {
    const adapter = new YfinanceAdapter("quotes");

    const result = await adapter.fetchTables({ market: BR, ticker: "PETR4", assetType: "stock" });

    expect((result.tables.asset_quotes ?? []).length).toBeGreaterThan(MIN_HISTORY_DAYS);
    expect(result.tables.asset?.[0]).toMatchObject({ code: "PETR4" });
  }, TIMEOUT_MS);
});

describe("CVM disclosures against the live zips", () => {
  it("writes the FRE, VLMO and CGVN rows of PETR4 from the last years", async () => {
    const adapter = new CvmDisclosureAdapter(buildCvmHttp(), () => Promise.resolve(PETROBRAS_CNPJ));

    const result = await adapter.fetchTables({ market: BR, ticker: "PETR4", assetType: "stock" });
    const datasets = new Set((result.tables.asset_filings ?? []).map((row) => row.document_type));

    expect(datasets.has("fre")).toBe(true);
    expect((result.tables.asset_filing_items ?? []).length).toBeGreaterThan(MIN_HISTORY_DAYS);
  }, TIMEOUT_MS);
});
