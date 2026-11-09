import { copyFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { B3CotahistAdapter } from "@/Adapters/B3/B3CotahistAdapter.ts";
import { HttpFailureError } from "@/Errors/HttpFailureError.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";

const FIXTURE = join(import.meta.dirname, "..", "..", "Testing", "fixtures", "b3", "COTAHIST_A2025.zip");
const NOW_YEAR = 2025;
const NOT_USED = "not used";
const PETR4_REQUEST = { market: "BR", ticker: "PETR4", assetType: "stock" };

const RECORDED_YEAR = "COTAHIST_A2025.ZIP";
const NOT_FOUND = 404;

const buildHttp = (urls: string[] = []): HttpPort => ({
  getText: () => Promise.reject(new Error(NOT_USED)),
  getBytes: () => Promise.reject(new Error(NOT_USED)),
  postForm: () => Promise.reject(new Error(NOT_USED)),
  getCookies: () => Promise.reject(new Error(NOT_USED)),
  downloadToFile: (url: string, filePath: string) => {
    // Why: only the recorded year is served from the fixture; any other year answers 404, as B3 does for a year it does not have.
    urls.push(url);
    if (!url.endsWith(RECORDED_YEAR)) {
      return Promise.reject(new HttpFailureError("the vendor answered with status 404", NOT_FOUND));
    }
    copyFileSync(FIXTURE, filePath);
    return Promise.resolve(1);
  },
});

describe("B3CotahistAdapter.fetchTables()", () => {
  it("asks for the current year and the one before, and a year with no file gives no rows", async () => {
    const urls: string[] = [];
    const adapter = new B3CotahistAdapter(buildHttp(urls), B3CotahistAdapter.BASE_URL, () => NOW_YEAR);

    const result = await adapter.fetchTables(PETR4_REQUEST);

    expect(urls).toStrictEqual([
      "https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_A2024.ZIP",
      "https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_A2025.ZIP",
    ]);
    expect(result.tables.quotes?.every((row) => String(row.date).startsWith("2025"))).toBe(true);
  });

  it("keeps only the ticker asked, with its prices read from the fixed-width record", async () => {
    const adapter = new B3CotahistAdapter(buildHttp(), B3CotahistAdapter.BASE_URL, () => NOW_YEAR);

    const result = await adapter.fetchTables(PETR4_REQUEST);
    const rows = result.tables.quotes ?? [];

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.ticker === "PETR4" && row.asset_type === "stock")).toBe(true);
    expect(rows[0]).toMatchObject({
      market: "BR", ticker: "PETR4", date: "2025-01-20",
      open: 37.22, high: 37.43, low: 37.11, close: 37.29, adj_close: null, volume: 13912800, source: "b3",
    });
  });

  it("reads a FII from the same file, under its own ticker", async () => {
    const adapter = new B3CotahistAdapter(buildHttp(), B3CotahistAdapter.BASE_URL, () => NOW_YEAR);

    const result = await adapter.fetchTables({ market: "BR", ticker: "HGLG11", assetType: "fii" });

    expect(result.tables.quotes?.map((row) => row.date)).toStrictEqual(["2025-05-26", "2025-05-27", "2025-06-02"]);
    expect(result.tables.quotes?.[1]).toMatchObject({ close: 160.5, asset_type: "fii" });
  });

  it("flags the quote of a day that repeats the day before with zero volume, and keeps the row", async () => {
    const adapter = new B3CotahistAdapter(buildHttp(), B3CotahistAdapter.BASE_URL, () => NOW_YEAR);

    const result = await adapter.fetchTables({ market: "BR", ticker: "HGLG11", assetType: "fii" });

    expect(result.tables.quotes?.every((row) => typeof row.is_stale === "boolean")).toBe(true);
  });
});
