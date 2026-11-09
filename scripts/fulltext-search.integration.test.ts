import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FullTextIndexService } from "@/Services/FullTextIndexService.ts";
import { StoreService } from "@/Services/StoreService.ts";

// Why: this test installs the DuckDB full-text extension from the network (ADR 0013), so it runs with `pnpm test:integration`, not in `pnpm test`.
const TEMP_PREFIX = join(tmpdir(), "fts-integration-test-");
const FIRST_SEQ = 1;
const FIRST_PAGE = 1;
const NEXT = 1;
const buildSearchSql = (query: string, section: string | null = null): string => {
  const sectionArgument = section === null ? "NULL" : `'${section}'`;
  return `SELECT text, section, page, score FROM search_chunks('${query}', 'BR:stock:PETR4', 'material_fact', ${sectionArgument}) ORDER BY score DESC`;
};

describe("FullTextIndexService.buildIndex()", () => {
  let directory: string;
  let store: StoreService;

  beforeEach(async () => {
    directory = mkdtempSync(TEMP_PREFIX);
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    store = await StoreService.open(
      { INVESTMENT_MCP_LOG_LEVEL: "error", INVESTMENT_MCP_CACHE_DIR: directory, INVESTMENT_MCP_CACHE_TTL_SECONDS: 60 },
      () => Date.now(),
    );
    await store.writer.run(
      "INSERT INTO asset_filings (filing_id, asset_id, document_type, category, reference_time_start, reference_time_end, published_at, subject, url, file_hash) VALUES ('f1', 'BR:stock:PETR4', 'material_fact', 'Fato Relevante', DATE '2026-03-01', DATE '2026-03-01', TIMESTAMPTZ '2026-03-01 00:00:00-03', 'Fato', 'https://www.rad.cvm.gov.br/x', 'h')",
    );
    const rows: [number, string | null, number, string][] = [
      [FIRST_SEQ, "Resultado", FIRST_PAGE, "O lucro líquido do trimestre foi de R$ 25 milhões."],
      [FIRST_SEQ + NEXT, "Dividendos", FIRST_PAGE + NEXT, "Os dividendos pagos somaram R$ 0,30 por ação."],
      [FIRST_SEQ + NEXT + NEXT, "Resultado", FIRST_PAGE + NEXT + NEXT, "A receita bruta cresceu 12%."],
    ];
    for (const [seq, section, page, text] of rows) {
      await store.writer.run(
        "INSERT INTO asset_filing_chunks (filing_id, asset_id, document_type, section, page, seq, text) VALUES ('f1', 'BR:stock:PETR4', 'material_fact', ?, ?, ?, ?)",
        [section, page, seq, text],
      );
    }
    await FullTextIndexService.buildIndex(store.writer);
  });

  afterEach(() => {
    store.close();
    vi.restoreAllMocks();
    rmSync(directory, { recursive: true, force: true });
  });

  const searchChunks = async (query: string, section: string | null = null): Promise<Record<string, unknown>[]> => {
    const reader = await store.openReader();
    try {
      return await reader.readRows(buildSearchSql(query, section));
    } finally {
      reader.close();
    }
  };

  it("finds a chunk by a word in another form, with its section and page (AC2)", async () => {
    const rows = await searchChunks("lucros");

    expect(rows).toStrictEqual([expect.objectContaining({ section: "Resultado", page: 1 })]);
    expect(String(rows[0]?.text)).toContain("lucro líquido");
  });

  it("finds a chunk by another form of a verb", async () => {
    const rows = await searchChunks("pago");

    expect(rows).toStrictEqual([expect.objectContaining({ section: "Dividendos", page: 2 })]);
  });

  it("documents the stemmer limit: a singular query does not find a plural of another stem", async () => {
    // Why: DuckDB's Portuguese stemmer maps dividendo to divid and dividendos to dividend; see docs/product/search.md.
    expect(await searchChunks("dividendo")).toStrictEqual([]);
  });

  it("ranks the chunks by score, highest first", async () => {
    const rows = await searchChunks("dividendos pagos");

    expect(rows[0]?.section).toBe("Dividendos");
    const scores = rows.map((row) => Number(row.score));
    expect(scores).toStrictEqual([...scores].sort((first, second) => second - first));
  });

  it("does not index Portuguese stop words, so a query of stop words finds nothing", async () => {
    expect(await searchChunks("de a o")).toStrictEqual([]);
  });

  it("finds a number, and each side of a decimal comma, as a token", async () => {
    expect(await searchChunks("25")).toStrictEqual([expect.objectContaining({ page: 1 })]);
    expect(await searchChunks("30")).toStrictEqual([expect.objectContaining({ page: 2 })]);
  });

  it("filters by section", async () => {
    expect(await searchChunks("dividendos", "Resultado")).toStrictEqual([]);
    expect(await searchChunks("dividendos", "Dividendos")).toHaveLength(1);
  });

  it("returns zero rows for a word that is not in the filing", async () => {
    expect(await searchChunks("inexistente")).toStrictEqual([]);
  });

  it("keeps the reader from reading a file, fetching a URL, reading an environment variable or writing", async () => {
    const reader = await store.openReader();
    try {
      await expect(reader.readRows("SELECT * FROM read_csv('/etc/hostname')")).rejects.toThrow();
      await expect(reader.readRows("SELECT * FROM read_csv('https://example.org/data.csv')")).rejects.toThrow();
      await expect(reader.readRows("SELECT getenv('HOME') AS home")).rejects.toThrow();
      await expect(reader.run("INSERT INTO asset_filing_chunks (filing_id) VALUES ('x')")).rejects.toThrow("read-only");
    } finally {
      reader.close();
    }
  });

  it("is rebuilt from the chunks, so a new chunk is found after the rebuild", async () => {
    await store.writer.run(
      "INSERT INTO asset_filing_chunks (filing_id, asset_id, document_type, section, page, seq, text) VALUES ('f1', 'BR:stock:PETR4', 'material_fact', 'Riscos', 4, 4, 'O risco cambial aumentou.')",
    );
    await FullTextIndexService.buildIndex(store.writer);

    expect(await searchChunks("cambial")).toStrictEqual([expect.objectContaining({ section: "Riscos", page: 4 })]);
  });
});
