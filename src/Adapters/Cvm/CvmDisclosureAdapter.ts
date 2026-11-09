import type { LegalIdLookup } from "@/Protocols/CvmProtocol.ts";
import type { CvmDisclosureDataset } from "@/Protocols/CvmDisclosureProtocol.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import type { ProviderFile, ProviderPort, ProviderRequest, ProviderResult, ProviderRow } from "@/Protocols/ProviderProtocol.ts";
import { CvmAdapter } from "@/Adapters/Cvm/CvmAdapter.ts";
import { PeriodService } from "@/Services/PeriodService.ts";
import { CsvUtil } from "@/Utils/CsvUtil.ts";
import { CvmUtil } from "@/Utils/CvmUtil.ts";
import { ZipFileUtil } from "@/Utils/ZipFileUtil.ts";

const DATASETS: readonly CvmDisclosureDataset[] = [
  { id: "fre", folder: "FRE" },
  { id: "vlmo", folder: "VLMO" },
  { id: "cgvn", folder: "CGVN" },
];
const MAIN_SECTION = "principal";
const CSV_SUFFIX = ".csv";
const ZIP_SUFFIX = ".zip";

export class CvmDisclosureAdapter implements ProviderPort<"disclosures"> {
  static readonly VENDOR = "cvm";

  readonly category = "disclosures";
  readonly vendor = CvmDisclosureAdapter.VENDOR;
  readonly markets = ["BR"] as const;
  readonly assetTypes = ["stock"] as const;

  private readonly http: HttpPort;
  private readonly resolveCnpj: LegalIdLookup;
  private readonly baseUrl: string;
  private readonly currentYear: () => number;

  constructor(
    http: HttpPort,
    resolveCnpj: LegalIdLookup,
    baseUrl: string = CvmAdapter.BASE_URL,
    currentYear: () => number = () => new Date().getUTCFullYear(),
  ) {
    this.http = http;
    this.resolveCnpj = resolveCnpj;
    this.baseUrl = baseUrl;
    this.currentYear = currentYear;
  }

  async fetchTables(request: ProviderRequest): Promise<ProviderResult> {
    // Why: the reference form (FRE), the securities holdings (VLMO) and the governance (CGVN) are yearly zips of CSV files; each row of the company is kept with its section, its date and its version, and the whole row as JSON, so no column is dropped.
    // Why: a company's disclosures are read through its CNPJ, which the ticker resolves to; a ticker with no CNPJ is pending, not guessed.
    const cnpj = await this.resolveCnpj(request.market, request.ticker);
    if (cnpj === undefined) {
      throw new Error(CvmUtil.buildUnmappedMessage(request.market, request.ticker));
    }
    const window = PeriodService.buildDefaultWindow(this.currentYear());
    const years = PeriodService.readYears(window);
    const rows: ProviderRow[] = [];
    const files: ProviderFile[] = [];
    for (const dataset of DATASETS) {
      for (const year of years) {
        const url = this.buildUrl(dataset, year);
        const key = { dataset: `cia_aberta-doc-${dataset.id}`, year };
        const found = await CvmUtil.downloadCvmFile(this.http, url, key, files, (zip) => {
          return CvmDisclosureAdapter.readZip(zip, dataset.id, year, cnpj, request);
        });
        rows.push(...(found ?? []));
      }
    }
    return { source: CvmDisclosureAdapter.VENDOR, tables: { company_disclosures: rows }, files };
  }

  private buildUrl(dataset: CvmDisclosureDataset, year: number): string {
    return `${this.baseUrl}/dados/CIA_ABERTA/DOC/${dataset.folder}/DADOS/${dataset.id}_cia_aberta_${year}${ZIP_SUFFIX}`;
  }

  static async readZip(
    zip: string,
    datasetId: string,
    year: number,
    cnpj: string,
    request: ProviderRequest,
  ): Promise<ProviderRow[]> {
    // Why: each CSV of the zip is streamed; a file without a CNPJ column is not a company table, so it is named as skipped, never read as a guess.
    const rows: ProviderRow[] = [];
    const prefix = `${datasetId}_cia_aberta`;
    const entries = await ZipFileUtil.listEntries(zip);
    for (const entry of entries.filter((item) => item.name.startsWith(prefix) && item.name.endsWith(CSV_SUFFIX))) {
      const section = CvmDisclosureAdapter.readSection(entry.name, prefix, year);
      const stream = await ZipFileUtil.openEntry(zip, entry.name);
      for await (const record of CsvUtil.readRecords(CvmUtil.readLines(stream))) {
        const companyCnpj = record.CNPJ_CIA ?? record.CNPJ_Companhia;
        if (companyCnpj === undefined || CvmUtil.readDigits(companyCnpj) !== CvmUtil.readDigits(cnpj)) {
          continue;
        }
        rows.push({
          section,
          market: request.market,
          ticker: request.ticker,
          asset_type: "stock",
          dataset: datasetId,
          reference_date: CsvUtil.readText(record.DT_REFER ?? record.Data_Referencia),
          version: CsvUtil.readText(record.VERSAO ?? record.Versao),
          document_id: CsvUtil.readText(record.ID_Documento),
          row_json: JSON.stringify(record),
          source_file: entry.name,
          source: CvmDisclosureAdapter.VENDOR,
        });
      }
    }
    return rows;
  }

  static readSection(name: string, prefix: string, year: number): string {
    // Why: the section is the part of the file name between the dataset and the year; the main file of a dataset has no section name, so it is named principal.
    const suffix = `_${year}${CSV_SUFFIX}`;
    const middle = name.slice(prefix.length, name.length - suffix.length).replace(/^_/u, "");
    return middle === "" ? MAIN_SECTION : middle;
  }
}
