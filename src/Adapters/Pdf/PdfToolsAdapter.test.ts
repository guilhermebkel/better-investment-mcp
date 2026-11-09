import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PdfToolsAdapter } from "@/Adapters/Pdf/PdfToolsAdapter.ts";

const FAKE_OCR = join(import.meta.dirname, "..", "..", "Testing", "fixtures", "pdf", "fake-ocrmypdf.sh");
const MISSING = "definitely-not-installed-here";

describe("PdfToolsAdapter.runOcr()", () => {
  it("passes the bytes through the OCR command and returns what it prints", async () => {
    const fixture = join(import.meta.dirname, "..", "..", "Testing", "fixtures", "pdf", "blank-page-sample.pdf");
    const pdf = new Uint8Array(readFileSync(fixture));

    const adapter = new PdfToolsAdapter({ ocrmypdf: FAKE_OCR });
    const result = await adapter.runOcr(pdf);

    const same = Buffer.from(result).equals(Buffer.from(pdf));
    expect(same).toBe(true);
  });

  it("names the installation when the OCR command is missing", async () => {
    const adapter = new PdfToolsAdapter({ ocrmypdf: MISSING });

    await expect(adapter.runOcr(new Uint8Array([1]))).rejects.toThrow("ocrmypdf is not installed");
  });
});

describe("PdfToolsAdapter.findTables()", () => {
  it("names the installation when python is missing", async () => {
    const adapter = new PdfToolsAdapter({ python: MISSING });

    await expect(adapter.findTables(new Uint8Array([1]))).rejects.toThrow("is not installed");
  });
});
