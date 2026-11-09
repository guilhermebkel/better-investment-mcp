import type { ExtractedDocument, ExtractedSegment } from "@/Protocols/DocumentTextProtocol.ts";
import { FormReferenceService } from "@/Services/FormReferenceService.ts";
import { PdfTextService } from "@/Services/PdfTextService.ts";
import { ZipFileUtil } from "@/Utils/ZipFileUtil.ts";

const PDF_SUFFIX = ".pdf";

export class ZipDocumentService {
  static async extract(bytes: Uint8Array): Promise<ExtractedDocument> {
    // Why: a zip that holds PDF entries is read as its PDFs (the periodic report, ITR, has its PDF inside the zip); a reference form keeps its item PDFs inside its XML, so it has no PDF entry and is read as a form.
    const pdfEntries = ZipFileUtil.listEntriesFromBuffer(bytes)
      .filter((entry) => entry.name.toLowerCase().endsWith(PDF_SUFFIX));
    if (pdfEntries.length === 0) {
      return FormReferenceService.extract(bytes);
    }
    const segments: ExtractedSegment[] = [];
    let pagesWithoutText = 0;
    for (const entry of pdfEntries) {
      const document = await PdfTextService.extract(ZipFileUtil.readEntryFromBuffer(bytes, entry));
      pagesWithoutText += document.pagesWithoutText;
      // Why: with one PDF the pages are the whole document; with several, each segment names the file it came from, so a page number is not read against the wrong file.
      const section = pdfEntries.length === 1 ? null : entry.name;
      for (const segment of document.segments) {
        segments.push({ section, page: segment.page, text: segment.text });
      }
    }
    return { format: "pdf", pagesWithoutText, segments };
  }
}
