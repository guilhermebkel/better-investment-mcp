import { extractText } from "unpdf";
import { HTMLElement, NodeType, parse } from "node-html-parser";
import type { ExtractedDocument, ExtractedSegment, HtmlReadState } from "@/Protocols/DocumentTextProtocol.ts";

const PDF_SIGNATURE = "%PDF";
const HTML_HINT = /<\s*(?:html|body|p|div|h[1-6]|table)\b/iu;
const WHITESPACE = /\s+/gu;
const MARKUP_DECLARATION = /^\s*<!/u;
const DROPPED_ELEMENTS = "head, title, script, style, noscript";
const HEADING_TAGS = ["H1", "H2", "H3", "H4"] as const;
const BLOCK_TAGS = [
  "P", "DIV", "LI", "UL", "OL", "TR", "TD", "TH", "TABLE", "SECTION", "ARTICLE", "BR", "HR", "BLOCKQUOTE", "PRE", "H5", "H6",
] as const;

export class DocumentTextService {
  static async extract(bytes: Uint8Array): Promise<ExtractedDocument> {
    // Why: the format is read from the bytes, not from the content type, because CVM sends PDFs as text/html.
    if (DocumentTextService.isPdf(bytes)) {
      return DocumentTextService.extractPdf(bytes);
    }
    const text = new TextDecoder("utf-8").decode(bytes);
    if (HTML_HINT.test(text)) {
      return { format: "html", pagesWithoutText: 0, segments: DocumentTextService.extractHtml(text) };
    }
    throw new Error("the document is neither a PDF nor an HTML page; it was not stored");
  }

  static normalize(text: string): string {
    return text.replace(WHITESPACE, " ").trim();
  }

  private static isHeading(tag: string): boolean {
    return HEADING_TAGS.some((known) => known === tag);
  }

  private static isBlock(tag: string): boolean {
    return BLOCK_TAGS.some((known) => known === tag);
  }

  private static isPdf(bytes: Uint8Array): boolean {
    return new TextDecoder("latin1").decode(bytes.subarray(0, PDF_SIGNATURE.length)) === PDF_SIGNATURE;
  }

  private static async extractPdf(bytes: Uint8Array): Promise<ExtractedDocument> {
    const { text } = await extractText(bytes, { mergePages: false });
    const pages = text.map((pageText) => DocumentTextService.normalize(pageText));
    // Why: a page with no text is usually a scanned image; it is counted and reported, never silently dropped (OCR is out of scope).
    const segments: ExtractedSegment[] = pages.flatMap((pageText, index) => {
      return pageText === "" ? [] : [{ section: null, page: index + 1, text: pageText }];
    });
    return { format: "pdf", pagesWithoutText: pages.filter((pageText) => pageText === "").length, segments };
  }

  private static extractHtml(html: string): ExtractedSegment[] {
    const root = parse(html);
    root.querySelectorAll(DROPPED_ELEMENTS).forEach((element) => element.remove());
    const segments: ExtractedSegment[] = [];
    const state: HtmlReadState = { section: null, buffer: [] };
    const addSegment = (): void => {
      const text = DocumentTextService.normalize(state.buffer.join(" "));
      if (text !== "") {
        segments.push({ page: null, section: state.section, text });
      }
      state.buffer = [];
    };
    const walk = (node: unknown): void => {
      if (node instanceof HTMLElement) {
        const tag = node.tagName;
        if (DocumentTextService.isHeading(tag)) {
          // Why: a heading starts a section and is not repeated in the chunks of that section.
          addSegment();
          state.section = DocumentTextService.normalize(node.text) || state.section;
          return;
        }
        if (DocumentTextService.isBlock(tag)) {
          addSegment();
          node.childNodes.forEach(walk);
          addSegment();
          return;
        }
        node.childNodes.forEach(walk);
        return;
      }
      if (typeof node === "object" && node !== null && Reflect.get(node, "nodeType") === NodeType.TEXT_NODE) {
        const text = String(Reflect.get(node, "text"));
        // Why: the doctype is parsed as text; it is markup, not the content of the document.
        if (!MARKUP_DECLARATION.test(text)) {
          state.buffer.push(text);
        }
      }
    };
    root.childNodes.forEach(walk);
    addSegment();
    return segments;
  }
}
