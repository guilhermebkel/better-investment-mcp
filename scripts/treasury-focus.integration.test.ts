import { describe, expect, it } from "vitest";
import { BcbFocusAdapter } from "@/Adapters/Bcb/BcbFocusAdapter.ts";
import { HttpAdapter } from "@/Adapters/Http/HttpAdapter.ts";
import { TesouroAdapter } from "@/Adapters/Tesouro/TesouroAdapter.ts";

// Why: this contract reaches the live Tesouro Transparente file and the live BCB Focus service, so it runs with `pnpm test:integration`
// and never in `pnpm test`; it proves that the header, the date format and the JSON shape the adapters read still match the services.
const TESOURO_CODE = "TESOURO_SELIC_2031-03-01";
const TESOURO_ASSET_ID = `BR:treasury:${TESOURO_CODE}`;
const BCB_IPCA = "IPCA";
const BCB_IPCA_ASSET_ID = "BR:index:IPCA";
const SURVEY_DATE = /^\d{4}-\d{2}-\d{2}$/u;
// Why: the file holds one bond's prices from its first day of sale; a bond sold in 2024 has a few hundred days, not the whole family.
const MIN_DAILY_ROWS = 200;
const MIN_MONTHLY_ROWS = 1000;
const MIN_BOND_PRICE = 1000;

describe("TesouroAdapter.fetchTables() against the live file", () => {
  it("returns the daily history of Tesouro Selic with its maturities, rates and unit prices", async () => {
    const http = new HttpAdapter({
      allowedHosts: [TesouroAdapter.HOST],
      maxBytes: TesouroAdapter.MAX_FILE_BYTES,
      timeoutMs: TesouroAdapter.TIMEOUT_MS,
    });
    const adapter = new TesouroAdapter(http);

    const result = await adapter.fetchTables({ market: "BR", assetType: "treasury", ticker: TESOURO_CODE });
    const rows = result.tables.asset_metrics ?? [];
    const prices = rows.filter((row) => row.metric === "treasury.base_unit_price");

    expect(prices.length).toBeGreaterThan(MIN_DAILY_ROWS);
    expect(new Set(rows.map((row) => row.asset_id))).toStrictEqual(new Set([TESOURO_ASSET_ID]));
    expect(prices.every((row) => typeof row.reference_time_start === "string" && row.unit === "brl")).toBe(true);
    expect(prices.some((row) => typeof row.value === "number" && row.value > MIN_BOND_PRICE)).toBe(true);
  });
});

describe("BcbFocusAdapter.fetchTables() against the live service", () => {
  it("returns the annual IPCA survey rows with their reference year and survey date", async () => {
    const http = new HttpAdapter({
      allowedHosts: [BcbFocusAdapter.HOST],
      maxBytes: BcbFocusAdapter.MAX_RESPONSE_BYTES,
      timeoutMs: BcbFocusAdapter.TIMEOUT_MS,
    });
    const adapter = new BcbFocusAdapter(http);

    const result = await adapter.fetchTables({ market: "BR", assetType: "index", ticker: BCB_IPCA });
    const rows = result.tables.asset_expectations ?? [];

    expect(rows.length).toBeGreaterThan(MIN_MONTHLY_ROWS);
    expect(rows.every((row) => row.asset_id === BCB_IPCA_ASSET_ID && typeof row.survey_time === "string" && SURVEY_DATE.test(row.survey_time)))
      .toBe(true);
    expect(rows.some((row) => row.calculation_base === 0)).toBe(true);
    expect(rows.some((row) => row.calculation_base === 1)).toBe(true);
  });
});
