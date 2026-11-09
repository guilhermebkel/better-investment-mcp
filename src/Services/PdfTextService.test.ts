import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PdfTextService } from "@/Services/PdfTextService.ts";
import type { PdfTable, PdfToolsPort } from "@/Protocols/PdfToolsProtocol.ts";

const FIXTURES = join(import.meta.dirname, "..", "Testing", "fixtures", "pdf");
const readFixture = (name: string): Uint8Array => new Uint8Array(readFileSync(join(FIXTURES, name)));
const NO_TABLES: PdfTable[] = [];
const RECEITA_TEXT = "Receita liquida 2024";
const BLANK_PAGE = "blank-page-sample.pdf";

const buildTools = (overrides: Partial<PdfToolsPort> = {}): PdfToolsPort => ({
  runOcr: () => Promise.reject(new Error("ocrmypdf is not installed")),
  findTables: () => Promise.resolve(NO_TABLES),
  ...overrides,
});

describe("PdfTextService.extract()", () => {
  it("reads the text of each page, and counts a page with no text when OCR cannot read it", async () => {
    const extracted = await PdfTextService.extract(readFixture(BLANK_PAGE), buildTools());

    expect(extracted.format).toBe("pdf");
    expect(extracted.pagesWithoutText).toBe(1);
    expect(extracted.segments).toStrictEqual([{ section: null, page: 1, text: RECEITA_TEXT }]);
  });

  it("reads a page with no text through OCR, and no longer counts it as empty", async () => {
    const ocrResult = readFixture("blank-page-ocr-sample.pdf");
    const extracted = await PdfTextService.extract(
      readFixture(BLANK_PAGE),
      buildTools({ runOcr: () => Promise.resolve(ocrResult) }),
    );

    expect(extracted.pagesWithoutText).toBe(0);
    expect(extracted.segments).toContainEqual({ section: null, page: 2, text: "Lucro liquido 2024" });
  });

  it("keeps the pages as they were when OCR fails, and counts them", async () => {
    const extracted = await PdfTextService.extract(readFixture(BLANK_PAGE), buildTools({
      runOcr: () => Promise.reject(new Error("ocrmypdf failed: tesseract is not installed")),
    }));

    expect(extracted.pagesWithoutText).toBe(1);
    expect(extracted.segments).toHaveLength(1);
  });

  it("adds each table as a segment of its page, with its cells and rows separated", async () => {
    const tables: PdfTable[] = [{ page: 1, rows: [["Ano", "Receita", "Lucro"], ["2024", "4.915", "735"]] }];
    const extracted = await PdfTextService.extract(
      readFixture(BLANK_PAGE),
      buildTools({ findTables: () => Promise.resolve(tables) }),
    );

    expect(extracted.segments).toContainEqual({ section: "table", page: 1, text: "Ano | Receita | Lucro ; 2024 | 4.915 | 735" });
  });

  it("keeps the text when the table reader is missing", async () => {
    const extracted = await PdfTextService.extract(readFixture(BLANK_PAGE), buildTools({
      findTables: () => Promise.reject(new Error("PyMuPDF is not installed for python3")),
    }));

    expect(extracted.segments).toStrictEqual([{ section: null, page: 1, text: RECEITA_TEXT }]);
  });
});
