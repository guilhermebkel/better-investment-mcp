import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DuckDbAdapter } from "@/Adapters/DuckDb/DuckDbAdapter.ts";
import { StoreUnavailableError } from "@/Errors/StoreUnavailableError.ts";
import type { Env } from "@/Protocols/EnvProtocol.ts";
import { StoreService } from "@/Services/StoreService.ts";

const TEMP_PREFIX = join(tmpdir(), "store-service-test-");
const START_MS = Date.parse("2026-11-08T12:00:00Z");
const DATABASE_FILE = "investment-mcp-cache.duckdb";

describe("StoreService.open()", () => {
  let directory: string;
  let store: StoreService | undefined;
  let stderr: ReturnType<typeof vi.spyOn>;

  const buildEnv = (overrides: Partial<Env> = {}): Env => ({
    INVESTMENT_MCP_LOG_LEVEL: "info",
    INVESTMENT_MCP_CACHE_DIR: directory,
    INVESTMENT_MCP_CACHE_TTL_SECONDS: 60,
    ...overrides,
  });

  beforeEach(() => {
    directory = mkdtempSync(TEMP_PREFIX);
    stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  });

  afterEach(() => {
    store?.close();
    store = undefined;
    vi.restoreAllMocks();
    rmSync(directory, { recursive: true, force: true });
  });

  describe("when no file exists", () => {
    it("creates the file with every table and view", async () => {
      store = await StoreService.open(buildEnv());

      const rows = await store.writer.readRows("SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' ORDER BY table_name");

      expect(rows.map((row) => row.table_name)).toStrictEqual([
        "asset",
        "asset_attribute",
        "asset_complaints",
        "asset_coverage",
        "asset_dividends",
        "asset_expectations",
        "asset_filing_chunks",
        "asset_filing_items",
        "asset_filings",
        "asset_holdings",
        "asset_metrics",
        "asset_news",
        "asset_proceedings",
        "asset_quotes",
        "asset_splits",
        "load_files",
        "load_runs",
        "schema_version",
      ]);
    });

    it("writes nothing to stderr about a replacement", async () => {
      store = await StoreService.open(buildEnv());

      expect(stderr).not.toHaveBeenCalledWith(expect.stringContaining("store_replaced"));
    });
  });

  describe("when the file has an older schema version", () => {
    it("replaces it and says so on stderr", async () => {
      const databasePath = join(directory, DATABASE_FILE);
      const old = await DuckDbAdapter.openWriter(databasePath);
      await old.run("CREATE TABLE schema_version (version INTEGER NOT NULL); INSERT INTO schema_version VALUES (0);");
      old.close();

      store = await StoreService.open(buildEnv());

      expect(stderr).toHaveBeenCalledWith(expect.stringContaining("\"event\":\"store_replaced\""));
      expect(await store.writer.readRows("SELECT version FROM schema_version")).toStrictEqual([{ version: 13 }]);
    });
  });

  describe("when the file is corrupted", () => {
    it("replaces it with a new file and says so on stderr", async () => {
      writeFileSync(join(directory, DATABASE_FILE), "this is not a DuckDB file");

      store = await StoreService.open(buildEnv());

      expect(stderr).toHaveBeenCalledWith(expect.stringContaining("\"reason\":\"it cannot be opened\""));
      expect(await store.writer.readRows("SELECT version FROM schema_version")).toStrictEqual([{ version: 13 }]);
    });
  });

  describe("when the file is current", () => {
    it("keeps the rows of the file across a restart", async () => {
      store = await StoreService.open(buildEnv());
      await store.writer.run("INSERT INTO asset (asset_id, market, asset_type, code) VALUES ('BR:stock:PETR4', 'BR', 'stock', 'PETR4')");
      store.close();

      store = await StoreService.open(buildEnv());

      expect(await store.writer.readRows("SELECT code FROM asset")).toStrictEqual([{ code: "PETR4" }]);
      const databaseFile = join(directory, DATABASE_FILE);
      expect(existsSync(databaseFile)).toBe(true);
    });
  });

  describe("when the cache directory cannot be created", () => {
    it("fails with an error that names the variable", async () => {
      const blocker = join(directory, "blocker");
      writeFileSync(blocker, "a file, not a directory");

      const cacheDir = join(blocker, "cache");
      const opening = StoreService.open(buildEnv({ INVESTMENT_MCP_CACHE_DIR: cacheDir }));

      await expect(opening).rejects.toThrow(StoreUnavailableError);
      await expect(opening).rejects.toThrow("INVESTMENT_MCP_CACHE_DIR");
    });
  });

  describe("when a read-only reader is opened on the file", () => {
    it("shows the asset coverage of a finished run with its period and expiry", async () => {
      store = await StoreService.open(buildEnv(), () => START_MS);
      await store.writer.run("INSERT INTO asset (asset_id, market, asset_type, code) VALUES ('BR:stock:PETR4', 'BR', 'stock', 'PETR4')");
      await store.writer.run(
        "INSERT INTO asset_quotes (asset_id, reference_time_start, reference_time_end, close) VALUES ('BR:stock:PETR4', DATE '2026-11-02', DATE '2026-11-02', 30.5), ('BR:stock:PETR4', DATE '2026-11-06', DATE '2026-11-06', 31.0)",
      );
      const runId = await store.cache.startRun({ category: "quotes", assetId: "BR:stock:PETR4", source: "yahoo" });
      await store.cache.finishRun(runId, { rowsRead: 2 });

      const reader = await store.openReader();
      const rows = await reader.readRows(
        "SELECT category, asset_id, CAST(first_date AS VARCHAR) AS firstDate, CAST(last_date AS VARCHAR) AS lastDate, CAST(epoch_ms(expires_at) AS VARCHAR) AS expiresAtMs FROM asset_coverage",
      );
      reader.close();

      expect(rows).toStrictEqual([{
        category: "quotes",
        asset_id: "BR:stock:PETR4",
        firstDate: "2026-11-02",
        lastDate: "2026-11-06",
        expiresAtMs: String(START_MS + 60_000),
      }]);
    });
  });
});
