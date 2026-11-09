import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CvmAdapter } from "@/Adapters/Cvm/CvmAdapter.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import { FakeHttp } from "@/Testing/FakeHttp.ts";

type PeriodRange = {
  from: string; to: string;
};

const FIXTURES = join(import.meta.dirname, "..", "..", "Testing", "fixtures", "cvm");
const EVENTUAL_2025 = new Uint8Array(readFileSync(join(FIXTURES, "recorded-eventual-fi-2025-irdm11-sample.csv")));
const EVENTUAL_URL_2025 = "https://dados.cvm.gov.br/dados/FI/DOC/EVENTUAL/DADOS/eventual_fi_2025.csv";
const EVENTUAL_URL_2026 = "https://dados.cvm.gov.br/dados/FI/DOC/EVENTUAL/DADOS/eventual_fi_2026.csv";
const IRDM_FUND = "28.830.325/0001-10";
const IRIDIUM_CRI_FUND = "41.076.564/0001-95";
const OCTOBER_START = "2025-10-01";
const OCTOBER_END = "2025-10-31";
const OCTOBER_2025 = { from: OCTOBER_START, to: OCTOBER_END };
const FULL_2025 = { from: "2025-01-01", to: "2025-12-31" };
const OCTOBER_REPORT_LINK = "https://fnet.bmfbovespa.com.br/fnet/publico/downloadDocumento?id=1035283";
const CURRENT_YEAR = 2025;

const buildServing = (): HttpPort => FakeHttp.buildServing({ [EVENTUAL_URL_2025]: EVENTUAL_2025 }).http;

const fetchFund = (http: HttpPort, cnpj: string, period: PeriodRange) => {
  const adapter = new CvmAdapter(http, () => Promise.resolve(cnpj), CvmAdapter.BASE_URL, () => CURRENT_YEAR);
  return adapter.fetchTables({ market: "BR", ticker: "IRDM11", assetType: "fii", period });
};

describe("CvmFundFilingAdapter.fetchFilings()", () => {
  it("returns the October 2025 management report of IRDM11 with its official link and its CNPJ (AC3)", async () => {
    const result = await fetchFund(buildServing(), IRDM_FUND, OCTOBER_2025);
    const filings = result.tables.asset_filings ?? [];
    // Why: October 2025 holds three documents of IRDM11 (a notice, a material fact and the report); only the report is the one asked for.
    expect(filings).toHaveLength(3);
    const reports = filings.filter((row) => row.document_type === "management_report");
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      asset_id: "BR:fii:IRDM11",
      document_type: "management_report",
      category: "RELAT GERENCIAL",
      reference_time_start: OCTOBER_END,
      reference_time_end: OCTOBER_END,
      url: OCTOBER_REPORT_LINK,
    });
  });

  it("reports a month with no document as missing, and does not fill it from another fund (AC3)", async () => {
    const result = await fetchFund(buildServing(), IRIDIUM_CRI_FUND, OCTOBER_2025);
    expect(result.tables.asset_filings).toStrictEqual([]);
  });

  it("reports an October 2026 document as missing when the year's file is not published (AC3)", async () => {
    const { http, urls } = FakeHttp.buildServing({ [EVENTUAL_URL_2025]: EVENTUAL_2025 });
    const result = await fetchFund(http, IRDM_FUND, { from: "2026-10-01", to: "2026-10-31" });
    expect(urls).toStrictEqual([EVENTUAL_URL_2026]);
    expect(result.tables.asset_filings).toStrictEqual([]);
  });

  it("sorts the IRDM11 documents of 2025 into management reports, material facts and other documents, keeping the CVM document type", async () => {
    const result = await fetchFund(buildServing(), IRDM_FUND, FULL_2025);
    const filings = result.tables.asset_filings ?? [];
    const kindToCount = filings.reduce<Record<string, number>>((counts, row) => {
      const kind = String(row.document_type);
      return { ...counts, [kind]: (counts[kind] ?? 0) + 1 };
    }, {});
    expect(filings).toHaveLength(28);
    expect(kindToCount).toStrictEqual({ management_report: 10, material_fact: 7, other: 11 });
    expect(filings.find((row) => row.category === "AVISO MERCADO")?.document_type).toBe("other");
  });

  it("records the eventual file it read, with its hash and size, for the version history (S4)", async () => {
    const result = await fetchFund(buildServing(), IRDM_FUND, OCTOBER_2025);
    expect(result.files).toStrictEqual([{
      url: EVENTUAL_URL_2025,
      dataset: "fi-doc-eventual",
      referenceYear: 2025,
      sha256: result.files?.[0]?.sha256 ?? "",
      sizeBytes: EVENTUAL_2025.byteLength,
    }]);
    expect(result.files?.[0]?.sha256).toMatch(/^[0-9a-f]{64}$/u);
  });
});
