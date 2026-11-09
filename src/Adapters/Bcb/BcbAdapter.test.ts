import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BcbAdapter } from "@/Adapters/Bcb/BcbAdapter.ts";
import { HttpFailureError } from "@/Errors/HttpFailureError.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import type { ProviderRow } from "@/Protocols/ProviderProtocol.ts";

const FIXTURES = join(import.meta.dirname, "..", "..", "Testing", "fixtures", "bcb");
const readFixture = (name: string): string => readFileSync(join(FIXTURES, name), "utf8");
const NOW = new Date(Date.UTC(2025, 2, 31));
const NOT_USED = "not used";
const PERCENT_PER_MONTH = "percent_per_month";
const SEPTEMBER_2026_START = "2026-09-01";
const IGPM_ASSET = "BR:index:IGPM";
const MACRO_VALUE_METRIC = "macro.value";

const buildHttpAnswering = (answer: (url: string) => string): {
  http: HttpPort; urls: string[];
} => {
  const urls: string[] = [];
  const http: HttpPort = {
    getText: (url: string) => {
      urls.push(url);
      return Promise.resolve(answer(url));
    },
    getBytes: () => Promise.reject(new Error(NOT_USED)),
    postForm: () => Promise.reject(new Error(NOT_USED)),
    downloadToFile: () => Promise.reject(new Error("not used")),
    getCookies: () => Promise.reject(new Error("not used")),
  };
  return { http, urls };
};

const buildHttpFailing = (error: Error): HttpPort => ({
  getText: () => Promise.reject(error),
  getBytes: () => Promise.reject(error),
  postForm: () => Promise.reject(error),
  downloadToFile: () => Promise.reject(new Error("not used")),
  getCookies: () => Promise.reject(new Error("not used")),
});

describe("BcbAdapter.fetchTables()", () => {
  it("keeps the four series with their SGS codes (PTAX is a currency, read by its own adapter)", () => {
    expect(BcbAdapter.SERIES.map((definition) => [definition.name, definition.code])).toStrictEqual([
      ["IPCA", 433], ["CDI", 12], ["SELIC", 432], ["IGPM", 189],
    ]);
  });

  it("fills macro_series for igpm from SGS 189, a monthly percent change", async () => {
    const answer = "[{\"data\":\"01/08/2026\",\"valor\":\"-0.22\"},{\"data\":\"01/09/2026\",\"valor\":\"1.57\"}]";
    const { http } = buildHttpAnswering(() => answer);
    const adapter = new BcbAdapter(http, BcbAdapter.BASE_URL, () => NOW);
    const result = await adapter.fetchTables({ market: "BR", assetType: "index", ticker: "IGPM" });

    expect(result.tables.asset_metrics).toContainEqual({
      asset_id: IGPM_ASSET, metric: MACRO_VALUE_METRIC,
      reference_time_start: SEPTEMBER_2026_START, reference_time_end: SEPTEMBER_2026_START,
      value: 1.57, unit: PERCENT_PER_MONTH,
    });
    expect(result.tables.asset_metrics).toContainEqual({
      asset_id: IGPM_ASSET, metric: MACRO_VALUE_METRIC, reference_time_start: "2026-08-01", reference_time_end: "2026-08-01", value: -0.22, unit: PERCENT_PER_MONTH,
    });
  });

  it("fills macro_series with source bcb from the recorded IPCA answer (AC1)", async () => {
    const { http } = buildHttpAnswering(() => readFixture("sgs-433-ipca-2025q1.json"));
    const adapter = new BcbAdapter(http, BcbAdapter.BASE_URL, () => NOW);
    const result = await adapter.fetchTables({ market: "BR", assetType: "index", ticker: "IPCA" });
    const buildMacroRow = (date: string, value: number): ProviderRow => ({
      asset_id: "BR:index:IPCA", metric: MACRO_VALUE_METRIC, reference_time_start: date, reference_time_end: date, unit: PERCENT_PER_MONTH, value,
    });

    expect(result.source).toBe("bcb");
    expect(result.tables.asset_metrics).toStrictEqual([
      buildMacroRow("2025-01-01", 0.16),
      buildMacroRow("2025-02-01", 1.31),
      buildMacroRow("2025-03-01", 0.56),
    ]);
  });

  it("returns only the days of the requested period, although the service sends the whole series", async () => {
    const { http } = buildHttpAnswering(() => readFixture("sgs-433-ipca-2025q1.json"));
    const adapter = new BcbAdapter(http, BcbAdapter.BASE_URL, () => NOW);
    const whole = await adapter.fetchTables({ market: "BR", assetType: "index", ticker: "IPCA" });
    const period = { from: "2025-01-01", to: "2025-01-31" };
    const filtered = await adapter.fetchTables({ market: "BR", assetType: "index", ticker: "IPCA", period });

    const rows = filtered.tables.asset_metrics ?? [];
    expect(rows.length).toBeGreaterThan(0);
    const dates = rows.map((row) => String(row.reference_time_start));
    expect(dates.every((date) => date >= period.from && date <= period.to)).toBe(true);
    expect(rows.length).toBeLessThan((whole.tables.asset_metrics ?? []).length);
  });

  it("refuses an unknown series and lists the known ones (AC2)", async () => {
    const { http } = buildHttpAnswering(() => "[]");
    await expect(new BcbAdapter(http).fetchTables({ market: "BR", assetType: "index", ticker: "IBOV" }))
      .rejects.toThrow("unknown series index:IBOV; the known series are index:IPCA, tax_rate:CDI, tax_rate:SELIC, index:IGPM");
  });

  it("reads every window of a long period with no gap or duplicate date (AC3)", async () => {
    const { http, urls } = buildHttpAnswering((url) => {
      const from = /dataInicial=(\d{2}\/\d{2}\/\d{4})/u.exec(url)?.[1] ?? "";
      return JSON.stringify([{ data: from, valor: "1" }]);
    });
    const result = await new BcbAdapter(http, BcbAdapter.BASE_URL, () => NOW).fetchTables({ market: "BR", assetType: "tax_rate", ticker: "CDI" });
    const dates = (result.tables.asset_metrics ?? []).map((row) => row.reference_time_start);

    expect(urls).toHaveLength(BcbAdapter.splitWindows(new Date(Date.UTC(1990, 0, 1)), NOW).length);
    expect(new Set(dates).size).toBe(dates.length);
  });

  it("fails with the cause and writes nothing when the service answers with its error format (AC4)", async () => {
    const { http } = buildHttpAnswering(() => "{\"error\":\"endpoint not found!\"}");
    await expect(new BcbAdapter(http).fetchTables({ market: "BR", assetType: "index", ticker: "IPCA" })).rejects.toThrow("the response format changed");
  });

  it("fails on an empty body (AC4)", async () => {
    const { http } = buildHttpAnswering(() => "  ");
    await expect(new BcbAdapter(http).fetchTables({ market: "BR", assetType: "index", ticker: "IPCA" })).rejects.toThrow("empty body");
  });

  it("names the rate limit when the service answers 429", async () => {
    const http = buildHttpFailing(new HttpFailureError("the vendor answered with a rate limit (status 429)", 429));
    await expect(new BcbAdapter(http).fetchTables({ market: "BR", assetType: "index", ticker: "IPCA" })).rejects.toThrow("BCB answered with a rate limit");
  });
});

describe("BcbAdapter.splitWindows()", () => {
  it("splits a period into ten-year windows that touch with no gap or overlap", () => {
    const windows = BcbAdapter.splitWindows(new Date(Date.UTC(1990, 0, 1)), new Date(Date.UTC(2005, 5, 30)));
    const pairs = windows.map((window) => {
      return [BcbAdapter.formatBrazilian(window.from), BcbAdapter.formatBrazilian(window.to)];
    });
    expect(pairs).toStrictEqual([
      ["01/01/1990", "31/12/1999"],
      ["01/01/2000", "30/06/2005"],
    ]);
  });

  it("returns one window for a period shorter than ten years", () => {
    expect(BcbAdapter.splitWindows(new Date(Date.UTC(2024, 0, 1)), new Date(Date.UTC(2024, 11, 31)))).toHaveLength(1);
  });
});
