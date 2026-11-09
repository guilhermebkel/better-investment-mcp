import { describe, expect, it } from "vitest";
import { BcbFocusAdapter } from "@/Adapters/Bcb/BcbFocusAdapter.ts";
import { HttpAdapter } from "@/Adapters/Http/HttpAdapter.ts";
import { TesouroAdapter } from "@/Adapters/Tesouro/TesouroAdapter.ts";

// Why: this contract reaches the live Tesouro Transparente file and the live BCB Focus service, so it runs with `pnpm test:integration`
// and never in `pnpm test`; it proves that the header, the date format and the JSON shape the adapters read still match the services.
const TESOURO_FAMILY = "Tesouro Selic";
const BCB_IPCA = "ipca";
const SURVEY_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const MIN_DAILY_ROWS = 1000;
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

    const result = await adapter.fetchTables({ market: "TDIR", ticker: TESOURO_FAMILY });
    const rows = result.tables.treasury_prices ?? [];

    expect(rows.length).toBeGreaterThan(MIN_DAILY_ROWS);
    expect(new Set(rows.map((row) => row.bond_type))).toStrictEqual(new Set([TESOURO_FAMILY]));
    expect(rows.every((row) => typeof row.base_date === "string" && typeof row.maturity === "string")).toBe(true);
    expect(rows.some((row) => typeof row.base_unit_price === "number" && row.base_unit_price > MIN_BOND_PRICE)).toBe(true);
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

    const result = await adapter.fetchTables({ market: "FOCUS", ticker: BCB_IPCA });
    const rows = result.tables.market_expectations ?? [];

    expect(rows.length).toBeGreaterThan(MIN_MONTHLY_ROWS);
    expect(rows.every((row) => row.indicator === BCB_IPCA && typeof row.survey_date === "string" && SURVEY_DATE.test(row.survey_date)))
      .toBe(true);
    expect(rows.some((row) => row.calculation_base === 0)).toBe(true);
    expect(rows.some((row) => row.calculation_base === 1)).toBe(true);
  });
});
