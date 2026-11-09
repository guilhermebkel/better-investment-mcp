import { extractText } from "unpdf";
import type { ExtractedDocument, ExtractedSegment } from "@/Protocols/DocumentTextProtocol.ts";
import { TextUtil } from "@/Utils/TextUtil.ts";

export class PdfTextService {
  static async extract(bytes: Uint8Array): Promise<ExtractedDocument> {
    const { text } = await extractText(bytes, { mergePages: false });
    const pages = text.map((pageText) => TextUtil.normalize(pageText));
    // Why: a page with no text is usually a scanned image; it is counted and reported, never silently dropped (OCR is out of scope).
    const segments: ExtractedSegment[] = pages.flatMap((pageText, index) => {
      return pageText === "" ? [] : [{ section: null, page: index + 1, text: pageText }];
    });
    return { format: "pdf", pagesWithoutText: pages.filter((pageText) => pageText === "").length, segments };
  }
}
