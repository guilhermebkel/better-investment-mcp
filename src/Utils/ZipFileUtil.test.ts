import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ZipFileUtil } from "@/Utils/ZipFileUtil.ts";

const SAMPLE = join(import.meta.dirname, "..", "Testing", "fixtures", "zip", "sample.zip");

const readAll = async (stream: AsyncIterable<Buffer | string>): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString("latin1");
};

describe("ZipFileUtil.listEntries()", () => {
  it("lists the entries from the central directory, with their sizes and method", async () => {
    const entries = await ZipFileUtil.listEntries(SAMPLE);

    expect(entries.map((entry) => [entry.name, entry.method])).toStrictEqual([
      ["inf_diario_fi_202611.csv", 8],
      ["stored.csv", 0],
    ]);
    expect(entries[0]?.uncompressedBytes).toBe(77);
  });
});

describe("ZipFileUtil.openEntry()", () => {
  it("streams a deflated entry inflated, without loading the file whole", async () => {
    const stream = await ZipFileUtil.openEntry(SAMPLE, "inf_diario_fi_202611.csv");

    expect(await readAll(stream)).toBe("CNPJ_FUNDO_CLASSE;VL_QUOTA\n00.017.024/0001-53;45.36\n12.005.956/0001-65;10.10\n");
  });

  it("streams a stored entry as it is", async () => {
    const stream = await ZipFileUtil.openEntry(SAMPLE, "stored.csv");

    expect(await readAll(stream)).toBe("A;B\n1;2\n");
  });

  it("refuses an entry the zip does not hold", async () => {
    await expect(ZipFileUtil.openEntry(SAMPLE, "missing.csv")).rejects.toThrow("has no entry missing.csv");
  });
});
