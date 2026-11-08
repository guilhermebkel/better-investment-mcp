import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DuckDbAdapter } from "@/Adapters/DuckDb/DuckDbAdapter.ts";

const TEMP_PREFIX = join(tmpdir(), "duckdb-adapter-test-");

describe("DuckDbAdapter.openReader()", () => {
  let directory: string;
  let databasePath: string;
  let writer: DuckDbAdapter;
  let reader: DuckDbAdapter | undefined;

  beforeEach(async () => {
    directory = mkdtempSync(TEMP_PREFIX);
    databasePath = join(directory, "test.duckdb");
    writer = await DuckDbAdapter.openWriter(databasePath);
    await writer.run("CREATE TABLE numbers (value INTEGER); INSERT INTO numbers VALUES (1);");
  });

  afterEach(() => {
    reader?.close();
    reader = undefined;
    writer.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("reads the rows the writer has committed", async () => {
    reader = await DuckDbAdapter.openReader(databasePath);

    expect(await reader.readRows("SELECT value FROM numbers")).toStrictEqual([{ value: 1 }]);
  });

  it("sees a row the writer commits after the reader was opened, when the reader is opened again", async () => {
    await writer.run("INSERT INTO numbers VALUES (2)");
    reader = await DuckDbAdapter.openReader(databasePath);

    expect(await reader.readRows("SELECT count(*)::INTEGER AS total FROM numbers")).toStrictEqual([{ total: 2 }]);
  });

  it("refuses an INSERT", async () => {
    reader = await DuckDbAdapter.openReader(databasePath);

    await expect(reader.run("INSERT INTO numbers VALUES (3)")).rejects.toThrow("read-only");
  });

  it("refuses a CREATE TABLE", async () => {
    reader = await DuckDbAdapter.openReader(databasePath);

    await expect(reader.run("CREATE TABLE other (value INTEGER)")).rejects.toThrow("read-only");
  });

  it("refuses to read a file through a file function", async () => {
    reader = await DuckDbAdapter.openReader(databasePath);

    await expect(reader.readRows("SELECT * FROM read_csv('/etc/hostname')")).rejects.toThrow("file system operations are disabled");
  });

  it("refuses to attach another file", async () => {
    reader = await DuckDbAdapter.openReader(databasePath);

    await expect(reader.run(`ATTACH '${join(directory, "other.duckdb")}' AS other`)).rejects.toThrow("file system operations are disabled");
  });

  it("leaves the writer working after the reader is closed", async () => {
    reader = await DuckDbAdapter.openReader(databasePath);
    reader.close();
    reader = undefined;

    await writer.run("INSERT INTO numbers VALUES (4)");

    expect(await writer.readRows("SELECT count(*)::INTEGER AS total FROM numbers")).toStrictEqual([{ total: 2 }]);
  });
});
