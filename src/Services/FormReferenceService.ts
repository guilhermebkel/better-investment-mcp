import { HTMLElement, parse } from "node-html-parser";
import type { ExtractedDocument, ExtractedSegment, FormItem } from "@/Protocols/DocumentTextProtocol.ts";
import { PdfTextService } from "@/Services/PdfTextService.ts";
import { TextUtil } from "@/Utils/TextUtil.ts";
import { ZipFileUtil } from "@/Utils/ZipFileUtil.ts";

const XML_SUFFIX = ".xml";
const FORM_PATH = ["XmlFormularioReferencia", "DadosFRE", "Formulario"] as const;
const NAME_TAG = "NomeArquivoPdf";
const CONTENT_TAG = "ImagemObjetoArquivoPdf";
const WINDOWS_1252 = "windows-1252";
const PDF_SUFFIX = /\.pdf$/iu;
const DOCX_SUFFIX = /(?: docx|\.docx)+$/iu;
const UNNAMED_ITEM = "documento";

export class FormReferenceService {
  static async extract(bytes: Uint8Array): Promise<ExtractedDocument> {
    // Why: a CVM reference form is a zip with one XML; the text of each item is a PDF inside that XML, so every chunk names its section and item, and its page is the page of that PDF.
    const entry = ZipFileUtil.listEntriesFromBuffer(bytes)
      .find((candidate) => candidate.name.toLowerCase().endsWith(XML_SUFFIX));
    if (entry === undefined) {
      throw new Error("the form zip has no XML; no text was stored");
    }
    // Why: the XML is cp1252 although it declares UTF-8; reading it as UTF-8 would garble every accent of the body.
    const xml = new TextDecoder(WINDOWS_1252).decode(ZipFileUtil.readEntryFromBuffer(bytes, entry));
    const items = FormReferenceService.readItems(xml);
    if (items.length === 0) {
      throw new Error("the form XML has no PDF item; no text was stored");
    }
    const segments: ExtractedSegment[] = [];
    let pagesWithoutText = 0;
    for (const item of items) {
      // Why: the PDF reader takes a Uint8Array; a Buffer is refused, so the decoded bytes are copied into one.
      const document = await PdfTextService.extract(new Uint8Array(Buffer.from(item.content, "base64")));
      pagesWithoutText += document.pagesWithoutText;
      for (const segment of document.segments) {
        segments.push({ section: `${item.section} ${item.label}`, page: segment.page, text: segment.text });
      }
    }
    return { format: "form", pagesWithoutText, segments };
  }

  static readItems(xml: string): FormItem[] {
    const form = FormReferenceService.findForm(parse(xml));
    const items: FormItem[] = [];
    for (const section of FormReferenceService.readElements(form)) {
      for (const parent of FormReferenceService.walk(section)) {
        const children = FormReferenceService.readElements(parent);
        const names = children.filter((child) => child.rawTagName === NAME_TAG);
        const contents = children.filter((child) => child.rawTagName === CONTENT_TAG);
        names.forEach((name, index) => {
          const content = contents[index];
          // Why: an empty pair is a blank slot of the form, with no document in it; it is skipped, not read.
          if (content !== undefined && content.text.trim() !== "") {
            items.push({
              section: section.rawTagName, label: FormReferenceService.readLabel(name.text), content: content.text,
            });
          }
        });
      }
    }
    return items;
  }

  private static findForm(root: HTMLElement): HTMLElement {
    let node: HTMLElement | undefined = root;
    for (const tag of FORM_PATH) {
      node = FormReferenceService.readElements(node).find((child) => child.rawTagName === tag);
      if (node === undefined) {
        throw new Error(`the form XML has no ${FORM_PATH.join("/")}; no text was stored`);
      }
    }
    return node;
  }

  private static readLabel(name: string): string {
    // Why: the label is the item number as CVM names the file (for example 4.1), so a reader finds the item of the form it talks about.
    const label = TextUtil.repairUtf8(name.trim()).replace(PDF_SUFFIX, "").replace(DOCX_SUFFIX, "").trim();
    return label === "" ? UNNAMED_ITEM : label;
  }

  private static readElements(node: HTMLElement): HTMLElement[] {
    return node.childNodes.filter((child): child is HTMLElement => child instanceof HTMLElement);
  }

  private static walk(node: HTMLElement): HTMLElement[] {
    return [node, ...FormReferenceService.readElements(node).flatMap((child) => FormReferenceService.walk(child))];
  }
}
