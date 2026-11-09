import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BcbAdapter } from "@/Adapters/Bcb/BcbAdapter.ts";
import { HttpFailureError } from "@/Errors/HttpFailureError.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";

const FIXTURES = join(import.meta.dirname, "..", "..", "Testing", "fixtures", "bcb");
const readFixture = (name: string): string => readFileSync(join(FIXTURES, name), "utf8");
const NOW = new Date(Date.UTC(2025, 2, 31));
const NOT_USED = "not used";

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
  it("keeps the five series with their SGS codes", () => {
    expect(BcbAdapter.SERIES.map((definition) => [definition.name, definition.code])).toStrictEqual([
      ["ipca", 433], ["cdi", 12], ["selic", 432], ["ptax", 1], ["igpm", 189],
    ]);
  });

  it("fills macro_series for igpm from SGS 189, a monthly percent change", async () => {
    const answer = "[{\"data\":\"01/08/2026\",\"valor\":\"-0.22\"},{\"data\":\"01/09/2026\",\"valor\":\"1.57\"}]";
    const { http } = buildHttpAnswering(() => answer);
    const adapter = new BcbAdapter(http, BcbAdapter.BASE_URL, () => NOW);
    const result = await adapter.fetchTables({ market: "SERIES", ticker: "igpm" });

    expect(result.tables.macro_series).toContainEqual({ series: "igpm", date: "2026-09-01", value: 1.57, source: "bcb" });
    expect(result.tables.macro_series).toContainEqual({ series: "igpm", date: "2026-08-01", value: -0.22, source: "bcb" });
  });

  it("fills macro_series with source bcb from the recorded IPCA answer (AC1)", async () => {
    const { http } = buildHttpAnswering(() => readFixture("sgs-433-ipca-2025q1.json"));
    const adapter = new BcbAdapter(http, BcbAdapter.BASE_URL, () => NOW);
    const result = await adapter.fetchTables({ market: "SERIES", ticker: "ipca" });

    expect(result.source).toBe("bcb");
    expect(result.tables.macro_series).toStrictEqual([
      { series: "ipca", date: "2025-01-01", value: 0.16, source: "bcb" },
      { series: "ipca", date: "2025-02-01", value: 1.31, source: "bcb" },
      { series: "ipca", date: "2025-03-01", value: 0.56, source: "bcb" },
    ]);
  });

  it("refuses an unknown series and lists the known ones (AC2)", async () => {
    const { http } = buildHttpAnswering(() => "[]");
    await expect(new BcbAdapter(http).fetchTables({ market: "SERIES", ticker: "ibov" }))
      .rejects.toThrow("the known series are ipca, cdi, selic, ptax, igpm");
  });

  it("reads every window of a long period with no gap or duplicate date (AC3)", async () => {
    const { http, urls } = buildHttpAnswering((url) => {
      const from = /dataInicial=(\d{2}\/\d{2}\/\d{4})/u.exec(url)?.[1] ?? "";
      return JSON.stringify([{ data: from, valor: "1" }]);
    });
    const result = await new BcbAdapter(http, BcbAdapter.BASE_URL, () => NOW).fetchTables({ market: "SERIES", ticker: "cdi" });
    const dates = (result.tables.macro_series ?? []).map((row) => row.date);

    expect(urls).toHaveLength(BcbAdapter.splitWindows(new Date(Date.UTC(1990, 0, 1)), NOW).length);
    expect(new Set(dates).size).toBe(dates.length);
  });

  it("fails with the cause and writes nothing when the service answers with its error format (AC4)", async () => {
    const { http } = buildHttpAnswering(() => "{\"error\":\"endpoint not found!\"}");
    await expect(new BcbAdapter(http).fetchTables({ market: "SERIES", ticker: "ipca" })).rejects.toThrow("the response format changed");
  });

  it("fails on an empty body (AC4)", async () => {
    const { http } = buildHttpAnswering(() => "  ");
    await expect(new BcbAdapter(http).fetchTables({ market: "SERIES", ticker: "ipca" })).rejects.toThrow("empty body");
  });

  it("names the rate limit when the service answers 429", async () => {
    const http = buildHttpFailing(new HttpFailureError("the vendor answered with a rate limit (status 429)", 429));
    await expect(new BcbAdapter(http).fetchTables({ market: "SERIES", ticker: "ipca" })).rejects.toThrow("BCB answered with a rate limit");
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
