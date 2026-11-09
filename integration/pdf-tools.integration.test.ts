import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PdfToolsAdapter } from "@/Adapters/Pdf/PdfToolsAdapter.ts";
import { PdfTextService } from "@/Services/PdfTextService.ts";

const FIXTURES = join(import.meta.dirname, "..", "src", "Testing", "fixtures", "pdf");
const readFixture = (name: string): Uint8Array => new Uint8Array(readFileSync(join(FIXTURES, name)));
const tools = PdfToolsAdapter.readFromEnvironment();

describe("PdfTextService.extract() with the real OCR and table tools", () => {
  it("reads a scanned page through OCRmyPDF and Tesseract, so its words are searchable", async () => {
    const extracted = await PdfTextService.extract(readFixture("scanned-sample.pdf"), tools);

    expect(extracted.pagesWithoutText).toBe(0);
    expect(extracted.segments.map((segment) => segment.text).join(" ")).toMatch(/Lucro liquido/iu);
  });

  it("reads the rows of a native table, one segment per table", async () => {
    const extracted = await PdfTextService.extract(readFixture("table-sample.pdf"), tools);
    const table = extracted.segments.find((segment) => segment.section === "table");

    expect(table).toMatchObject({ page: 1 });
    expect(table?.text).toContain("Ano | Receita | Lucro");
    expect(table?.text).toContain("2024 |");
  });
});
