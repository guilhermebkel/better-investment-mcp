import { HTMLElement, parse } from "node-html-parser";
import type { DfpAttachment, DfpAttachmentResult, PdfPage } from "@/Protocols/DfpAttachmentProtocol.ts";
import { PdfTextService } from "@/Services/PdfTextService.ts";
import { ZipFileUtil } from "@/Utils/ZipFileUtil.ts";

const XML_SUFFIX = ".xml";
const ATTACHMENT_MARK = "AnexoDocumento";
const GROUP_TAG = "NumeroGrupoRelacionado";
const NAME_TAG = "NomeArquivoPdf";
const CONTENT_TAG = "ImagemObjetoArquivoPdf";
// Why: RAD's group 412 is the notes to the financial statements, the same document in every company checked (ADR 0045).
const NOTES_GROUP = "412";
const NOTES_SECTION = "NotasExplicativas";

export class DfpAttachmentService {
  static async extract(bytes: Uint8Array): Promise<DfpAttachmentResult> {
    // Why: a DFP or ITR zip keeps its notes as a complete PDF inside its XML, and the rendered PDF can lack them (issue #61, phase 4). Only the notes are read; the management report is contained in the rendered PDF of every checked filing.
    const notes = DfpAttachmentService.readXmlEntries(bytes)
      .flatMap((xml) => DfpAttachmentService.readAttachments(xml))
      .filter((attachment) => attachment.group === NOTES_GROUP);
    const results = await Promise.all(notes.map((attachment) => DfpAttachmentService.readPdf(attachment.content)));
    const segments = results.flatMap((pages) => (pages ?? []).map((page) => ({
      section: NOTES_SECTION, page: page.page, text: page.text,
    })));
    // Why: an attachment that is not a readable PDF is skipped and counted; the other attachments are still read (issue #61, S31).
    const skipped = results.filter((pages) => pages === null).length;
    return { segments, skipped };
  }

  private static readXmlEntries(bytes: Uint8Array): string[] {
    return ZipFileUtil.listEntriesFromBuffer(bytes)
      .filter((entry) => entry.name.toLowerCase().endsWith(XML_SUFFIX))
      .map((entry) => new TextDecoder("windows-1252").decode(ZipFileUtil.readEntryFromBuffer(bytes, entry)))
      .filter((text) => text.includes(ATTACHMENT_MARK));
  }

  private static readAttachments(xml: string): DfpAttachment[] {
    return parse(xml).querySelectorAll("*")
      .filter((element) => element.rawTagName.endsWith(ATTACHMENT_MARK))
      .map((element) => DfpAttachmentService.readAttachment(element))
      .filter((attachment): attachment is DfpAttachment => attachment !== null);
  }

  private static readAttachment(element: HTMLElement): DfpAttachment | null {
    const group = DfpAttachmentService.readChildText(element, GROUP_TAG);
    const name = DfpAttachmentService.readChildText(element, NAME_TAG);
    const content = DfpAttachmentService.readChildText(element, CONTENT_TAG);
    return group === "" || name === "" || content === "" ? null : { group, content };
  }

  private static readChildText(element: HTMLElement, tag: string): string {
    // Why: the parser's selectors compare upper-case tag names, so a child is found by its raw name, which keeps the case of the XML.
    const child = element.querySelectorAll("*").find((node) => node.rawTagName === tag);
    return child === undefined ? "" : child.text.trim();
  }

  private static async readPdf(base64: string): Promise<PdfPage[] | null> {
    try {
      // Why: the PDF reader takes a Uint8Array; a Buffer is refused, so the decoded bytes are copied into one.
      const document = await PdfTextService.extract(new Uint8Array(Buffer.from(base64, "base64")));
      return document.segments;
    } catch {
      return null;
    }
  }
}
