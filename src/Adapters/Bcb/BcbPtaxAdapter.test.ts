import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BcbPtaxAdapter } from "@/Adapters/Bcb/BcbPtaxAdapter.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";

const FIXTURE_PATH = join(import.meta.dirname, "..", "..", "Testing", "fixtures", "bcb", "olinda-ptax-usd-sample.json");
const FIXTURE = readFileSync(FIXTURE_PATH, "utf8");
const NOT_USED = "not used";
const CURRENT_YEAR = 2026;
const EMPTY_YEAR = "{\"value\":[]}";
const RECORDED_YEAR = "01-01-2026";

const buildHttp = (urls: string[] = []): HttpPort => ({
  getText: (url: string) => {
    urls.push(url);
    return Promise.resolve(url.includes(RECORDED_YEAR) ? FIXTURE : EMPTY_YEAR);
  },
  getBytes: () => Promise.reject(new Error(NOT_USED)),
  postForm: () => Promise.reject(new Error(NOT_USED)),
  getCookies: () => Promise.reject(new Error(NOT_USED)),
  downloadToFile: () => Promise.reject(new Error(NOT_USED)),
});

describe("BcbPtaxAdapter.fetchTables()", () => {
  it("asks for each year of the window, from 01-01 to 12-31 in the service's own date form", async () => {
    const urls: string[] = [];
    const adapter = new BcbPtaxAdapter(buildHttp(urls), BcbPtaxAdapter.BASE_URL, () => CURRENT_YEAR);

    await adapter.fetchTables({ market: "BR", assetType: "currency", ticker: "USD" });

    expect(urls).toHaveLength(3);
    expect(urls[0]).toContain("@moeda='USD'&@dataInicial='01-01-2024'&@dataFinalCotacao='12-31-2024'");
  });

  it("keeps only the closing bulletin of each day as the rate of that day", async () => {
    const adapter = new BcbPtaxAdapter(buildHttp(), BcbPtaxAdapter.BASE_URL, () => CURRENT_YEAR);

    const result = await adapter.fetchTables({ market: "BR", assetType: "currency", ticker: "USD" });
    const rows = result.tables.asset_metrics ?? [];
    const buyRows = rows.filter((row) => row.metric === "fx.buy_rate");
    const dates = buyRows.map((row) => row.reference_time_start);

    expect(buyRows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.asset_id === "BR:currency:USD" && row.unit === "brl_per_currency")).toBe(true);
    expect(dates).toStrictEqual([...new Set(dates)]);
    expect(dates.every((date) => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(date))).toBe(true);
    expect(rows.filter((row) => row.metric === "fx.sell_rate")).toHaveLength(buyRows.length);
  });

  it("refuses a currency that is not a three-letter code", async () => {
    const adapter = new BcbPtaxAdapter(buildHttp(), BcbPtaxAdapter.BASE_URL, () => CURRENT_YEAR);

    await expect(adapter.fetchTables({ market: "BR", assetType: "currency", ticker: "dollar" })).rejects.toThrow("is not a three-letter code");
  });
});
