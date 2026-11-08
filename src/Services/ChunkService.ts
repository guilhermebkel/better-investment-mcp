import type { ChunkRow, ExtractedSegment } from "@/Protocols/DocumentTextProtocol.ts";
import { DocumentTextService } from "@/Services/DocumentTextService.ts";

export class ChunkService {
  static readonly CHUNK_CHARS = 1200;
  static readonly OVERLAP_CHARS = 150;

  static split(segments: readonly ExtractedSegment[]): ChunkRow[] {
    // Why: the rules are in docs/product/search.md; a chunk never crosses a section or a page, so its section and page are exact.
    const pieces = segments.flatMap((segment) => {
      return ChunkService.chunkText(DocumentTextService.normalize(segment.text)).map((text) => ({
        section: segment.section,
        page: segment.page,
        text,
      }));
    });
    return pieces.map((piece, index) => ({ ...piece, seq: index + 1 }));
  }

  static chunkText(text: string): string[] {
    if (text.length <= ChunkService.CHUNK_CHARS) {
      return text === "" ? [] : [text];
    }
    const parts: string[] = [];
    let start = 0;
    while (start < text.length) {
      const end = ChunkService.findEnd(text, start);
      const part = text.slice(start, end).trim();
      if (part !== "") {
        parts.push(part);
      }
      if (end >= text.length) {
        break;
      }
      start = ChunkService.findNextStart(text, end);
    }
    return parts;
  }

  private static findEnd(text: string, start: number): number {
    const limit = Math.min(start + ChunkService.CHUNK_CHARS, text.length);
    if (limit >= text.length) {
      return limit;
    }
    // Why: a cut lands on a space, so no word is split between two chunks, unless the text has no space at all.
    const space = text.lastIndexOf(" ", limit);
    return space > start + ChunkService.OVERLAP_CHARS ? space : limit;
  }

  private static findNextStart(text: string, end: number): number {
    // Why: the next chunk starts before the cut, so a sentence at the border is found in both chunks.
    const overlapStart = end - ChunkService.OVERLAP_CHARS;
    const nextSpace = text.indexOf(" ", overlapStart);
    return nextSpace !== -1 && nextSpace < end ? nextSpace + 1 : overlapStart;
  }
}
