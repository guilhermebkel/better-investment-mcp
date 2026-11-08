import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpRefusedError } from "@/Errors/HttpRefusedError.ts";
import type { ProviderRequest, ProviderResult } from "@/Protocols/ProviderProtocol.ts";
import type { Requirement } from "@/Protocols/SqlGuardProtocol.ts";
import { LoaderService } from "@/Services/LoaderService.ts";
import { ProviderRegistryService } from "@/Services/ProviderRegistryService.ts";
import { StoreService } from "@/Services/StoreService.ts";
import { FakeProvider } from "@/Testing/FakeProvider.ts";

const START_MS = Date.parse("2026-11-08T12:00:00Z");
const TTL_SECONDS = 60;
const TEMP_PREFIX = join(tmpdir(), "loader-test-");
const PRIMARY_SETTING = "BR:primary";
const FALLBACK_SETTING = "BR:primary>fallback";
const QUOTE_DATE = "2026-11-06";
const QUOTE_NEXT_DATE = "2026-11-07";
const PETR4: Requirement = { table: "quotes", category: "quotes", market: "BR", ticker: "PETR4", assetType: "stock" };

const quoteRow = (date: string, close: number, source = "primary"): Record<string, string | number> => ({
  market: "BR", ticker: "PETR4", asset_type: "stock", date, close, source,
});

describe("LoaderService.ensure()", () => {
  let directory: string;
  let nowMs: number;
  let store: StoreService;
  let respond: (request: ProviderRequest) => Promise<ProviderResult>;
  let primary: FakeProvider<"quotes">;
  let fallback: FakeProvider<"quotes">;

  beforeEach(async () => {
    directory = mkdtempSync(TEMP_PREFIX);
    nowMs = START_MS;
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    store = await StoreService.open(
      { INVESTMENT_MCP_LOG_LEVEL: "error", INVESTMENT_MCP_CACHE_DIR: directory, INVESTMENT_MCP_CACHE_TTL_SECONDS: TTL_SECONDS },
      () => nowMs,
    );
    respond = () => Promise.resolve({ source: "primary", tables: { quotes: [quoteRow(QUOTE_DATE, 31)] } });
    primary = new FakeProvider({ category: "quotes", vendor: "primary", markets: ["BR"], assetTypes: ["stock"], respond: (request) => respond(request) });
    fallback = new FakeProvider({
      category: "quotes",
      vendor: "fallback",
      markets: ["BR"],
      assetTypes: ["stock"],
      respond: () => Promise.resolve({ source: "fallback", tables: { quotes: [quoteRow(QUOTE_DATE, 30, "fallback")] } }),
    });
  });

  afterEach(() => {
    store.close();
    vi.restoreAllMocks();
    rmSync(directory, { recursive: true, force: true });
  });

  const buildLoader = (setting: string): LoaderService => new LoaderService(store, new ProviderRegistryService(
    { INVESTMENT_MCP_LOG_LEVEL: "error", INVESTMENT_MCP_CACHE_TTL_SECONDS: TTL_SECONDS, INVESTMENT_MCP_QUOTES_PROVIDER: setting },
    { ...ProviderRegistryService.buildEmptyCatalog(), quotes: { primary, fallback } },
  ));

  const readStoredCloses = async (): Promise<number[]> => (await store.writer.readRows("SELECT close FROM quotes ORDER BY date")).map((row) => Number(row.close));

  describe("when the asset is not in the store", () => {
    it("calls the provider and writes its rows, so the query then sees them", async () => {
      const loader = buildLoader(PRIMARY_SETTING);

      const [entry] = await loader.ensure([PETR4]);

      expect(entry).toMatchObject({ status: "loaded", source: "primary", isFallback: false, rowsWritten: 1 });
      expect(await readStoredCloses()).toStrictEqual([31]);
      expect(primary.calls).toBe(1);
    });
  });

  describe("when the same asset is asked again before it expires", () => {
    it("calls no provider and reports the asset as fresh", async () => {
      const loader = buildLoader(PRIMARY_SETTING);
      await loader.ensure([PETR4]);

      const [entry] = await loader.ensure([PETR4]);

      expect(entry).toMatchObject({ status: "fresh", source: "primary" });
      expect(primary.calls).toBe(1);
    });
  });

  describe("when the expiry has passed", () => {
    it("calls the provider again and replaces the old rows in one transaction", async () => {
      const loader = buildLoader(PRIMARY_SETTING);
      await loader.ensure([PETR4]);
      nowMs = START_MS + TTL_SECONDS * 1000;
      respond = () => Promise.resolve({ source: "primary", tables: { quotes: [quoteRow(QUOTE_NEXT_DATE, 32)] } });

      const [entry] = await loader.ensure([PETR4]);

      expect(entry).toMatchObject({ status: "loaded", rowsWritten: 1 });
      expect(await readStoredCloses()).toStrictEqual([32]);
    });
  });

  describe("when the provider fails", () => {
    it("keeps the rows of the previous load, records the error, and shows it in the entry", async () => {
      const loader = buildLoader(PRIMARY_SETTING);
      await loader.ensure([PETR4]);
      nowMs = START_MS + TTL_SECONDS * 1000;
      respond = () => Promise.reject(new Error("Yahoo answered with a rate limit"));

      const [entry] = await loader.ensure([PETR4]);
      const runs = await store.writer.readRows("SELECT error FROM cache_runs ORDER BY started_at DESC LIMIT 1");

      expect(entry).toMatchObject({ status: "failed", error: "primary failed: Yahoo answered with a rate limit" });
      expect(await readStoredCloses()).toStrictEqual([31]);
      expect(runs).toStrictEqual([{ error: "primary failed: Yahoo answered with a rate limit" }]);
    });
  });

  describe("when the provider fails before any row exists", () => {
    it("writes nothing and reports the failure", async () => {
      respond = () => Promise.reject(new HttpRefusedError("the response is larger than 5242880 bytes"));
      const loader = buildLoader(PRIMARY_SETTING);

      const [entry] = await loader.ensure([PETR4]);

      expect(entry).toMatchObject({ status: "failed", rowsWritten: 0 });
      expect(await readStoredCloses()).toStrictEqual([]);
    });
  });

  describe("when the primary fails and a fallback is set", () => {
    it("the fallback serves the request, its rows carry its name, and the entry says it was a fallback", async () => {
      respond = () => Promise.reject(new Error("rate limit"));
      const loader = buildLoader(FALLBACK_SETTING);

      const [entry] = await loader.ensure([PETR4]);

      expect(entry).toMatchObject({ status: "loaded", source: "fallback", isFallback: true, rowsWritten: 1 });
      expect(await store.writer.readRows("SELECT source FROM quotes")).toStrictEqual([{ source: "fallback" }]);
    });
  });

  describe("when two queries ask for the same missing asset at once", () => {
    it("calls the provider once and gives both the same result", async () => {
      const loader = buildLoader(PRIMARY_SETTING);

      const [first, second] = await Promise.all([loader.ensure([PETR4]), loader.ensure([PETR4])]);

      expect(primary.calls).toBe(1);
      expect(first).toStrictEqual(second);
    });
  });

  describe("when a row fails while it is written", () => {
    it("rolls the whole run back, so the rows of the previous load stay", async () => {
      const loader = buildLoader(PRIMARY_SETTING);
      await loader.ensure([PETR4]);
      nowMs = START_MS + TTL_SECONDS * 1000;
      respond = () => Promise.resolve({ source: "primary", tables: { quotes: [quoteRow(QUOTE_NEXT_DATE, 32), quoteRow(QUOTE_NEXT_DATE, 33)] } });

      const [entry] = await loader.ensure([PETR4]);

      expect(entry).toMatchObject({ status: "failed" });
      expect(await readStoredCloses()).toStrictEqual([31]);
    });
  });

  describe("when the provider sends a row for another asset", () => {
    it("refuses the run and writes nothing", async () => {
      respond = () => Promise.resolve({ source: "primary", tables: { quotes: [{ ...quoteRow(QUOTE_DATE, 31), ticker: "VALE3" }] } });
      const loader = buildLoader(PRIMARY_SETTING);

      const [entry] = await loader.ensure([PETR4]);

      expect(entry).toMatchObject({ status: "failed", error: "the provider sent a row for another asset in quotes" });
      expect(await readStoredCloses()).toStrictEqual([]);
    });
  });

  describe("when no provider serves the asset's market", () => {
    it("reports that no provider serves it and calls no provider", async () => {
      const loader = buildLoader(PRIMARY_SETTING);

      const [entry] = await loader.ensure([{ ...PETR4, market: "US", ticker: "AAPL" }]);

      expect(entry?.status).toBe("failed");
      expect(entry?.error).toContain("no provider serves US quotes");
      expect(primary.calls).toBe(0);
    });
  });
});
