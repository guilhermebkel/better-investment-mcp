import { describe, expect, it } from "vitest";
import { CvmAdapter } from "@/Adapters/Cvm/CvmAdapter.ts";
import { CvmFundMonthlyAdapter } from "@/Adapters/Cvm/CvmFundMonthlyAdapter.ts";
import { CvmStatementAdapter } from "@/Adapters/Cvm/CvmStatementAdapter.ts";
import { CvmTickerAdapter } from "@/Adapters/Cvm/CvmTickerAdapter.ts";
import { HttpAdapter } from "@/Adapters/Http/HttpAdapter.ts";
import { CvmDocumentAdapter } from "@/Adapters/Cvm/CvmDocumentAdapter.ts";
import { DocumentTextService } from "@/Services/DocumentTextService.ts";
import { ChunkService } from "@/Services/ChunkService.ts";
import { FullTextIndexService } from "@/Services/FullTextIndexService.ts";
import { StoreService } from "@/Services/StoreService.ts";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CvmUtil } from "@/Utils/CvmUtil.ts";

// Why: this contract reaches the live CVM open data, so it runs with `pnpm test:integration` and never in `pnpm test`; it proves that the file names and the headers the adapters read still match CVM's files (issue #28, AC1, AC2, AC3, AC5).
const PETROBRAS_CNPJ = "33.000.167/0001-01";
const PETR4 = "PETR4";
const STOCK = "stock";
const FII = "fii";
const BR = "BR";
const MONTHS_OF_2025 = 10;
const IRDM11 = "IRDM11";
const SEPTEMBER_30_2024 = "2024-09-30";
const QUARTER_3_2024 = { from: SEPTEMBER_30_2024, to: SEPTEMBER_30_2024 };
const YEAR_2025 = { from: "2025-01-01", to: "2025-12-31" };
const OCTOBER_2025 = { from: "2025-10-01", to: "2025-10-31" };
const ITR_2024_URL = `${CvmUtil.BASE_URL}/dados/CIA_ABERTA/DOC/ITR/DADOS/itr_cia_aberta_2024.zip`;
const ALLOWED_HOSTS = [CvmUtil.HOST];
const OCTOBER_REPORT_URL = "https://fnet.bmfbovespa.com.br/fnet/publico/downloadDocumento?id=1035283";
const MIN_SEARCH_WORD = 6;
const HEX_HASH = /^[0-9a-f]{64}$/u;

const buildHttp = (): HttpAdapter => {
  return new HttpAdapter({ allowedHosts: ALLOWED_HOSTS, maxBytes: CvmAdapter.MAX_FILE_BYTES });
};

describe("CvmTickerAdapter.resolveCnpj()", () => {
  it("maps PETR4 to Petrobras's CNPJ in the live company list (AC5)", async () => {
    const ticker = new CvmTickerAdapter(buildHttp());
    await expect(ticker.resolveCnpj(BR, PETR4)).resolves.toBe(PETROBRAS_CNPJ);
  });
});

describe("CvmStatementAdapter.fetchTables()", () => {
  it("gives PETR4's DRE for the third quarter of 2024 from the ITR 2024 file, with its version and file (AC1)", async () => {
    const adapter = new CvmStatementAdapter(buildHttp(), new CvmTickerAdapter(buildHttp()).resolveCnpj);
    const result = await adapter.fetchTables({ market: BR, ticker: PETR4, assetType: STOCK, period: QUARTER_3_2024 });
    const dre = (result.tables.financial_statements ?? []).filter((row) => row.statement === "DRE_con");
    expect(dre.length).toBeGreaterThan(0);
    expect(dre[0]).toMatchObject({ period_end: SEPTEMBER_30_2024, source_file: "itr_cia_aberta_DRE_con_2024.csv", source: "cvm" });
    expect(typeof dre[0]?.version).toBe("number");
    const itr = result.files?.find((file) => file.url === ITR_2024_URL);
    expect(itr?.sha256).toMatch(HEX_HASH);
  });
});

describe("CvmFundMonthlyAdapter.fetchTables()", () => {
  it("gives IRDM11's monthly net worth for 2025, one row per reference month, each with its version and file (AC2)", async () => {
    const adapter = new CvmFundMonthlyAdapter(buildHttp(), new CvmTickerAdapter(buildHttp()).resolveCnpj);
    const result = await adapter.fetchTables({ market: BR, ticker: IRDM11, assetType: FII, period: YEAR_2025 });
    const rows = result.tables.fii_monthly ?? [];
    expect(rows.length).toBeGreaterThanOrEqual(MONTHS_OF_2025);
    for (const row of rows) {
      expect(typeof row.net_worth).toBe("number");
      expect(String(row.source_file)).toContain("inf_mensal_fii_");
    }
  });
});

describe("CvmAdapter.fetchTables()", () => {
  it("returns IRDM11's October 2025 management report with its official link and CNPJ (AC3)", async () => {
    const adapter = new CvmAdapter(buildHttp(), new CvmTickerAdapter(buildHttp()).resolveCnpj);
    const result = await adapter.fetchTables({ market: BR, ticker: IRDM11, assetType: FII, period: OCTOBER_2025 });
    const reports = (result.tables.filings ?? []).filter((row) => row.filing_type === "management_report");
    expect(reports).toHaveLength(1);
    expect(String(reports[0]?.url)).toContain("https://fnet.bmfbovespa.com.br/");
  });
});

describe("CvmDocumentAdapter.fetchDocument() for an FNET report", () => {
  it("downloads IRDM11's October 2025 report from FNET, indexes its text, and a search finds a word of it (P5)", async () => {
    const http = new HttpAdapter({
      allowedHosts: CvmDocumentAdapter.HOSTS,
      maxBytes: CvmDocumentAdapter.MAX_DOCUMENT_BYTES,
      timeoutMs: CvmDocumentAdapter.TIMEOUT_MS,
    });
    const bytes = await new CvmDocumentAdapter(http).fetchDocument(OCTOBER_REPORT_URL);
    const chunks = ChunkService.split((await DocumentTextService.extract(bytes)).segments);
    expect(chunks.length).toBeGreaterThan(0);
    const word = String(chunks[0]?.text).split(/\s+/u).find((candidate) => candidate.length >= MIN_SEARCH_WORD) ?? "";
    expect(word).not.toBe("");

    const directoryPrefix = join(tmpdir(), "fnet-live-");
    const directory = mkdtempSync(directoryPrefix);
    const store = await StoreService.open({ INVESTMENT_MCP_LOG_LEVEL: "error", INVESTMENT_MCP_CACHE_DIR: directory, INVESTMENT_MCP_CACHE_TTL_SECONDS: 60 }, () => Date.now());
    try {
      for (const chunk of chunks) {
        await store.writer.run(
          "INSERT INTO chunks (filing_id, market, ticker, asset_type, filing_type, section, page, seq, text) VALUES ('fnet', 'BR', 'IRDM11', 'fii', 'management_report', ?, ?, ?, ?)",
          [chunk.section, chunk.page, chunk.seq, chunk.text],
        );
      }
      await FullTextIndexService.buildIndex(store.writer);
      const reader = await store.openReader();
      try {
        const hits = await reader.readRows(`SELECT text FROM search_chunks('${word}', 'BR', 'IRDM11', 'fii', 'management_report', NULL)`);
        expect(hits.length).toBeGreaterThan(0);
      } finally {
        reader.close();
      }
    } finally {
      store.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
