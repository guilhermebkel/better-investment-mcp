import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabasePort } from "@/Protocols/DatabaseProtocol.ts";
import { FullTextIndexService } from "@/Services/FullTextIndexService.ts";
import { LoaderService } from "@/Services/LoaderService.ts";
import { ProviderRegistryService } from "@/Services/ProviderRegistryService.ts";
import { StoreService } from "@/Services/StoreService.ts";

const TEMP_PREFIX = join(tmpdir(), "fulltext-test-");
const START_MS = Date.parse("2026-11-08T12:00:00Z");
const TOTVS = "BR:stock:TOTS3";
const SEARCH = "SELECT text FROM search_chunks('lucro', 'BR:stock:TOTS3', 'material_fact', NULL, 'text')";

describe("FullTextIndexService.buildIndex()", () => {
  let directory: string;
  let store: StoreService;

  beforeEach(async () => {
    directory = mkdtempSync(TEMP_PREFIX);
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    store = await StoreService.open(
      { INVESTMENT_MCP_LOG_LEVEL: "error", INVESTMENT_MCP_CACHE_DIR: directory, INVESTMENT_MCP_CACHE_TTL_SECONDS: 60 },
      () => START_MS,
    );
    await store.writer.run(
      "INSERT INTO asset_filing_chunks (filing_id, asset_id, document_type, section, page, seq, text) VALUES ('f1', ?, 'material_fact', NULL, 1, 1, 'Lucro líquido de 2024')",
      [TOTVS],
    );
  });

  afterEach(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("builds the index and the search macro, so a query finds the chunk", async () => {
    await FullTextIndexService.buildIndex(store.writer);

    const reader = await store.openReader();
    const rows = await reader.readRows(SEARCH);
    reader.close();
    expect(rows).toHaveLength(1);
  });

  it("keeps the index readable while a rebuild runs, and when the rebuild fails", async () => {
    await FullTextIndexService.buildIndex(store.writer);
    // Why: a reader asks for the search right after the chunk table was dropped inside the rebuild; it must still see the index that was there.
    const readsDuringRebuild: number[] = [];
    const probing = {
      run: async (sql: string, values?: Parameters<DatabasePort["run"]>[1]) => {
        if (sql.includes("DROP TABLE IF EXISTS chunk_search")) {
          await store.writer.run(sql, values);
          const reader = await store.openReader();
          try {
            readsDuringRebuild.push((await reader.readRows(SEARCH)).length);
          } catch {
            readsDuringRebuild.push(-1);
          } finally {
            reader.close();
          }
          return;
        }
        if (sql.includes("create_fts_index")) {
          throw new Error("injected failure");
        }
        return store.writer.run(sql, values);
      },
      readRows: (sql: string) => store.writer.readRows(sql),
      loadFullText: () => store.writer.loadFullText(),
      close: () => undefined,
    };

    await expect(FullTextIndexService.buildIndex(probing)).rejects.toThrow("injected failure");
    expect(readsDuringRebuild).toStrictEqual([1]);

    const reader = await store.openReader();
    const rows = await reader.readRows(SEARCH);
    reader.close();
    expect(rows).toHaveLength(1);
  });

  describe("LoaderService.ensureSearchIndex()", () => {
    const buildLoader = (): LoaderService => new LoaderService(
      store,
      new ProviderRegistryService({ INVESTMENT_MCP_LOG_LEVEL: "error", INVESTMENT_MCP_CACHE_TTL_SECONDS: 60 }, ProviderRegistryService.buildEmptyCatalog()),
    );

    it("says no document is stored when there is nothing to search, and builds nothing", async () => {
      await store.writer.run("DELETE FROM asset_filing_chunks");

      const problem = await buildLoader().ensureSearchIndex();

      expect(problem).toContain("no document is loaded to search yet");
    });

    it("rebuilds the missing search macro when chunks are stored, so the search works again", async () => {
      await FullTextIndexService.buildIndex(store.writer);
      await store.writer.run(`DROP MACRO ${FullTextIndexService.MACRO}`);

      const problem = await buildLoader().ensureSearchIndex();

      expect(problem).toBeUndefined();
      const reader = await store.openReader();
      const rows = await reader.readRows(SEARCH);
      reader.close();
      expect(rows).toHaveLength(1);
    });

    it("does nothing when the search macro is already there", async () => {
      await FullTextIndexService.buildIndex(store.writer);

      expect(await buildLoader().ensureSearchIndex()).toBeUndefined();
    });
  });
});
