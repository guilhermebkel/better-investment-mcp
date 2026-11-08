import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CacheLoadResult } from "@/Protocols/CacheProtocol.ts";
import { StoreService } from "@/Services/StoreService.ts";

const START_MS = Date.parse("2026-11-08T12:00:00Z");
const ONE_SECOND_MS = 1000;
const TTL_SECONDS = 60;

const TEMP_PREFIX = join(tmpdir(), "cache-service-test-");
const LOCK_TEMP_PREFIX = join(tmpdir(), "cache-lock-test-");

describe("CacheService.isFresh()", () => {
  let directory: string;
  let nowMs: number;
  let store: StoreService;

  beforeEach(async () => {
    directory = mkdtempSync(TEMP_PREFIX);
    nowMs = START_MS;
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    store = await StoreService.open(
      { INVESTMENT_MCP_LOG_LEVEL: "info", INVESTMENT_MCP_CACHE_DIR: directory, INVESTMENT_MCP_CACHE_TTL_SECONDS: TTL_SECONDS },
      () => nowMs,
    );
  });

  afterEach(() => {
    store.close();
    vi.restoreAllMocks();
    rmSync(directory, { recursive: true, force: true });
  });

  const finishLoad = async (): Promise<void> => {
    const runId = await store.cache.startRun({ category: "quotes", market: "BR", ticker: "PETR4", source: "yahoo" });
    await store.cache.finishRun(runId, { rowsRead: 10 });
  };

  describe("when a run finished with an expiry in the future", () => {
    it("is true for that category, market and ticker", async () => {
      await finishLoad();

      expect(await store.cache.isFresh("quotes", "BR", "PETR4")).toBe(true);
    });

    it("is false for another ticker", async () => {
      await finishLoad();

      expect(await store.cache.isFresh("quotes", "BR", "VALE3")).toBe(false);
    });

    it("stays true one second before the expiry and turns false when the expiry passes", async () => {
      await finishLoad();
      nowMs = START_MS + (TTL_SECONDS - 1) * ONE_SECOND_MS;
      const beforeExpiry = await store.cache.isFresh("quotes", "BR", "PETR4");
      nowMs = START_MS + TTL_SECONDS * ONE_SECOND_MS;

      expect([beforeExpiry, await store.cache.isFresh("quotes", "BR", "PETR4")]).toStrictEqual([true, false]);
    });
  });

  describe("when the run failed", () => {
    it("is false", async () => {
      const runId = await store.cache.startRun({ category: "quotes", market: "BR", ticker: "PETR4", source: "yahoo" });
      await store.cache.finishRun(runId, { rowsRead: 0, errorMessage: "Yahoo answered with a rate limit" });

      expect(await store.cache.isFresh("quotes", "BR", "PETR4")).toBe(false);
    });
  });
});

describe("CacheService.runOnce()", () => {
  let directory: string;
  let store: StoreService;

  beforeEach(async () => {
    directory = mkdtempSync(LOCK_TEMP_PREFIX);
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    store = await StoreService.open({ INVESTMENT_MCP_LOG_LEVEL: "info", INVESTMENT_MCP_CACHE_DIR: directory, INVESTMENT_MCP_CACHE_TTL_SECONDS: TTL_SECONDS });
  });

  afterEach(() => {
    store.close();
    vi.restoreAllMocks();
    rmSync(directory, { recursive: true, force: true });
  });

  describe("when two callers ask for the same category, market and ticker at once", () => {
    it("runs the load once and gives both callers its result", async () => {
      let loads = 0;
      const load = async (): Promise<CacheLoadResult> => {
        loads += 1;
        await Promise.resolve();
        return { rowsWritten: 5, source: "fake", isFallback: false };
      };

      const results = await Promise.all([
        store.cache.runOnce("quotes", "BR", "PETR4", load),
        store.cache.runOnce("quotes", "BR", "PETR4", load),
      ]);

      expect([loads, results]).toStrictEqual([1, [{ rowsWritten: 5, source: "fake", isFallback: false }, { rowsWritten: 5, source: "fake", isFallback: false }]]);
    });
  });

  describe("when the load for the same key has finished", () => {
    it("runs a new load for the next caller", async () => {
      let loads = 0;
      const load = (): Promise<CacheLoadResult> => {
        loads += 1;
        return Promise.resolve({ rowsWritten: loads, source: "fake", isFallback: false });
      };

      await store.cache.runOnce("quotes", "BR", "PETR4", load);
      const second = await store.cache.runOnce("quotes", "BR", "PETR4", load);

      expect([loads, second]).toStrictEqual([2, { rowsWritten: 2, source: "fake", isFallback: false }]);
    });
  });

  describe("when the loads are for different tickers", () => {
    it("runs each of them", async () => {
      let loads = 0;
      const load = async (): Promise<CacheLoadResult> => {
        loads += 1;
        await Promise.resolve();
        return { rowsWritten: 1, source: "fake", isFallback: false };
      };

      await Promise.all([
        store.cache.runOnce("quotes", "BR", "PETR4", load),
        store.cache.runOnce("quotes", "BR", "VALE3", load),
      ]);

      expect(loads).toBe(2);
    });
  });
});
