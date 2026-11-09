import { extractText } from "unpdf";
import { PdfToolsAdapter } from "@/Adapters/Pdf/PdfToolsAdapter.ts";
import type { ExtractedDocument, ExtractedSegment } from "@/Protocols/DocumentTextProtocol.ts";
import type { PdfTable, PdfToolsPort } from "@/Protocols/PdfToolsProtocol.ts";
import { TextUtil } from "@/Utils/TextUtil.ts";

const TABLE_SECTION = "table";
const CELL_SEPARATOR = " | ";
const ROW_SEPARATOR = " ; ";

export class PdfTextService {
  static async extract(
    bytes: Uint8Array,
    tools: PdfToolsPort = PdfToolsAdapter.readFromEnvironment(),
  ): Promise<ExtractedDocument> {
    const pages = await PdfTextService.readPages(bytes);
    // Why: a page with no text is a scanned image; OCR reads those pages, and a failure of OCR keeps the pages as they were, counted and reported.
    const textPages = pages.includes("") ? await PdfTextService.applyOcr(bytes, pages, tools) : pages;
    const segments: ExtractedSegment[] = textPages.flatMap((pageText, index) => {
      return pageText === "" ? [] : [{ section: null, page: index + 1, text: pageText }];
    });
    // Why: a table is read from the native structure of its page; a page where no table is found, or where the tool is missing, keeps its text only.
    const tableSegments = await PdfTextService.readTableSegments(bytes, tools);
    return {
      format: "pdf",
      pagesWithoutText: textPages.filter((pageText) => pageText === "").length,
      segments: [...segments, ...tableSegments],
    };
  }

  private static async readPages(bytes: Uint8Array): Promise<string[]> {
    // Why: the PDF reader takes the buffer of the bytes it reads, so the same bytes read again (for OCR and tables) would be empty; the reader gets a copy.
    const { text } = await extractText(bytes.slice(), { mergePages: false });
    return text.map((pageText) => TextUtil.normalize(pageText));
  }

  private static async applyOcr(bytes: Uint8Array, pages: string[], tools: PdfToolsPort): Promise<string[]> {
    try {
      const ocrPages = await PdfTextService.readPages(await tools.runOcr(bytes));
      if (ocrPages.length !== pages.length) {
        return pages;
      }
      return pages.map((pageText, index) => (pageText === "" ? ocrPages[index] ?? "" : pageText));
    } catch {
      return pages;
    }
  }

  private static async readTableSegments(bytes: Uint8Array, tools: PdfToolsPort): Promise<ExtractedSegment[]> {
    let tables: PdfTable[];
    try {
      tables = await tools.findTables(bytes);
    } catch {
      return [];
    }
    return tables.flatMap((table) => {
      const text = table.rows
        .map((row) => row.map((cell) => TextUtil.normalize(cell)).filter((cell) => cell !== "").join(CELL_SEPARATOR))
        .filter((row) => row !== "")
        .join(ROW_SEPARATOR);
      return text === "" ? [] : [{ section: TABLE_SECTION, page: table.page, text }];
    });
  }
}
