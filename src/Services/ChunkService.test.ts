import { describe, expect, it } from "vitest";
import { ChunkService } from "@/Services/ChunkService.ts";

describe("ChunkService.split()", () => {
  it("keeps a short segment as one chunk with its section and page", () => {
    const chunks = ChunkService.split([{ section: "Dividendos", page: 4, text: "Pagos R$ 0,30 por acao." }]);

    expect(chunks).toStrictEqual([{ section: "Dividendos", item: null, page: 4, seq: 1, text: "Pagos R$ 0,30 por acao." }]);
  });

  it("numbers the chunks in document order across segments", () => {
    const chunks = ChunkService.split([
      { section: null, page: 1, text: "primeiro" },
      { section: null, page: 2, text: "segundo" },
    ]);

    expect(chunks.map((chunk) => chunk.seq)).toStrictEqual([1, 2]);
    expect(chunks.map((chunk) => chunk.page)).toStrictEqual([1, 2]);
  });

  it("cuts a long segment into chunks that overlap, and never splits a word", () => {
    const words = Array.from({ length: 400 }, (_, index) => `palavra${index}`);
    const text = words.join(" ");

    const parts = ChunkService.chunkText(text);

    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((part) => part.length <= ChunkService.CHUNK_CHARS)).toBe(true);
    for (const part of parts) {
      for (const piece of part.split(" ")) {
        expect(words).toContain(piece);
      }
    }
    const [first, second] = parts;
    const firstWords = first?.split(" ") ?? [];
    const secondWords = second?.split(" ") ?? [];
    expect(firstWords.some((word) => secondWords.includes(word))).toBe(true);
  });

  it("returns no chunk for an empty segment", () => {
    expect(ChunkService.split([{ section: null, page: 1, text: "   " }])).toStrictEqual([]);
  });
});
