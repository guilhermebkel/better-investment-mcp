import { describe, expect, it } from "vitest";
import { DuckDbAdapter } from "@/Adapters/DuckDb/DuckDbAdapter.ts";
import { DuckDbSchemaAdapter } from "@/Adapters/DuckDb/DuckDbSchemaAdapter.ts";
import type { DatabasePort } from "@/Protocols/DatabaseProtocol.ts";
import type { ProviderFile } from "@/Protocols/ProviderProtocol.ts";
import { FileVersionService } from "@/Services/FileVersionService.ts";

const URL_2024 = "https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/ITR/DADOS/itr_cia_aberta_2024.zip";
const HASH_FIRST = "a".repeat(64);
const HASH_SECOND = "b".repeat(64);
const FETCHED_FIRST = "2026-11-08T12:00:00.000Z";
const FETCHED_SECOND = "2026-11-20T12:00:00.000Z";

const buildFile = (sha256: string, sizeBytes: number): ProviderFile => ({
  url: URL_2024,
  dataset: "cia_aberta-doc-itr",
  referenceYear: 2024,
  sha256,
  sizeBytes,
});

const readVersions = async (database: DatabasePort): Promise<Record<string, unknown>[]> => database.readRows(
  "SELECT sha256, CAST(size_bytes AS INTEGER) AS sizeBytes, CAST(is_current AS VARCHAR) AS isCurrent FROM cvm_files ORDER BY sha256",
);

describe("FileVersionService.record()", () => {
  it("keeps a new version of a file beside the old one, and makes the new one current (AC5)", async () => {
    const database = await DuckDbAdapter.openWriter(":memory:");
    await DuckDbSchemaAdapter.createSchema(database);
    await FileVersionService.record(database, [buildFile(HASH_FIRST, 100)], FETCHED_FIRST);
    await FileVersionService.record(database, [buildFile(HASH_SECOND, 120)], FETCHED_SECOND);
    expect(await readVersions(database)).toStrictEqual([
      { sha256: HASH_FIRST, sizeBytes: 100, isCurrent: "false" },
      { sha256: HASH_SECOND, sizeBytes: 120, isCurrent: "true" },
    ]);
    database.close();
  });

  it("keeps one record and the current mark when a file is downloaded again unchanged (S4)", async () => {
    const database = await DuckDbAdapter.openWriter(":memory:");
    await DuckDbSchemaAdapter.createSchema(database);
    await FileVersionService.record(database, [buildFile(HASH_FIRST, 100)], FETCHED_FIRST);
    await FileVersionService.record(database, [buildFile(HASH_FIRST, 100)], FETCHED_SECOND);
    const rows = await readVersions(database);
    expect(rows).toStrictEqual([{ sha256: HASH_FIRST, sizeBytes: 100, isCurrent: "true" }]);
    const fetched = await database.readRows("SELECT CAST(fetched_at AS VARCHAR) AS fetchedAt FROM cvm_files");
    expect(fetched[0]?.fetchedAt).toContain("2026-11-20");
    database.close();
  });
});
