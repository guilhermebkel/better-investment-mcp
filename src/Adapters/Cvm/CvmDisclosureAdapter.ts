import type { LegalIdLookup } from "@/Protocols/CvmProtocol.ts";
import type { CvmDisclosureDataset, VersionStamp } from "@/Protocols/CvmDisclosureProtocol.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import type { ProviderFile, ProviderPort, ProviderRequest, ProviderResult, ProviderRow, TableToRows } from "@/Protocols/ProviderProtocol.ts";
import { CvmAdapter } from "@/Adapters/Cvm/CvmAdapter.ts";
import { PeriodService } from "@/Services/PeriodService.ts";
import { AssetIdUtil } from "@/Utils/AssetIdUtil.ts";
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
    return { source: CvmDisclosureAdapter.VENDOR, tables: CvmDisclosureAdapter.buildTables(rows), files };
  }

  static buildTables(rows: ProviderRow[]): TableToRows {
    // Why: a document is one asset_filings row, and each section of it is one asset_filing_items row; a document that has several sections is written once.
    const filingIdToRow = new Map<string, ProviderRow>();
    const items: ProviderRow[] = [];
    // Why: a company files a new version of the same reference form; only the highest version of each reference is kept, so a search never returns an older one.
    const latest = CvmDisclosureAdapter.readLatestVersions(rows);
    const newestRows = rows.filter((row) => CvmDisclosureAdapter.isLatest(row, latest));
    for (const row of newestRows) {
      const assetId = String(row.asset_id);
      const reference = row.reference_date ?? null;
      const version = row.version ?? null;
      const documentId = row.document_id ?? `${String(reference)}:${String(version)}`;
      const filingId = `${String(row.dataset)}:${assetId}:${String(documentId)}`;
      items.push({
        asset_id: assetId, filing_id: filingId, section: String(row.section), row_json: String(row.row_json),
      });
      // Why: only the main section of a document carries its link (LINK_DOC), so a later section of the same document fills the url when the first one had none.
      const existing = filingIdToRow.get(filingId);
      if (existing !== undefined) {
        existing.url ??= row.link ?? null;
        continue;
      }
      filingIdToRow.set(filingId, {
        filing_id: filingId,
        asset_id: assetId,
        document_type: String(row.dataset),
        category: null,
        subject: null,
        reference_time_start: reference,
        reference_time_end: reference,
        published_at: null,
        version: version === null ? null : Number(version),
        url: row.link ?? null,
        file_hash: null,
        source_file: row.source_file ?? null,
      });
    }
    return { asset_filings: [...filingIdToRow.values()], asset_filing_items: items };
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
          asset_id: AssetIdUtil.build({ market: request.market, assetType: "stock", code: request.ticker }),
          market: request.market,
          ticker: request.ticker,
          asset_type: "stock",
          dataset: datasetId,
          reference_date: CsvUtil.readText(record.DT_REFER ?? record.Data_Referencia),
          version: CsvUtil.readText(record.VERSAO ?? record.Versao),
          document_id: CvmDisclosureAdapter.readDocumentId(record.ID_DOC, record.ID_Documento),
          row_json: JSON.stringify(record),
          // Why: the reference form names its link LINK_DOC; the holdings file (VLMO) names it Link_Download, and a row with neither has no document to read.
          link: CvmDisclosureAdapter.readSecureLink(record.LINK_DOC ?? record.Link_Download),
          received: CsvUtil.readText(record.DT_RECEB ?? record.Data_Entrega),
          source_file: entry.name,
          source: CvmDisclosureAdapter.VENDOR,
        });
      }
    }
    return rows;
  }

  static readLatestVersions(rows: readonly ProviderRow[]): Map<string, VersionStamp> {
    // Why: the newest version of a reference is the highest version number; two rows of that version are told apart by the later receipt date.
    const referenceToStamp = new Map<string, VersionStamp>();
    for (const row of rows) {
      const key = CvmDisclosureAdapter.buildReferenceKey(row);
      const candidate = CvmDisclosureAdapter.readStamp(row);
      const current = referenceToStamp.get(key);
      if (current === undefined || CvmDisclosureAdapter.isNewer(candidate, current)) {
        referenceToStamp.set(key, candidate);
      }
    }
    return referenceToStamp;
  }

  static isLatest(row: ProviderRow, referenceToStamp: Map<string, VersionStamp>): boolean {
    const winner = referenceToStamp.get(CvmDisclosureAdapter.buildReferenceKey(row));
    const stamp = CvmDisclosureAdapter.readStamp(row);
    // Why: a section of a form without a receipt date (the shareholder file has none) belongs to the newest version alone; only a row with its own receipt date must match the newest receipt.
    return winner?.version === stamp.version && (stamp.received === "" || stamp.received === winner.received);
  }

  private static buildReferenceKey(row: ProviderRow): string {
    return `${String(row.dataset)}:${String(row.asset_id)}:${String(row.reference_date)}`;
  }

  private static readStamp(row: ProviderRow): VersionStamp {
    const version = row.version === null || row.version === undefined ? -1 : Number(row.version);
    return { version, received: String(row.received ?? "") };
  }

  private static isNewer(candidate: VersionStamp, current: VersionStamp): boolean {
    if (candidate.version !== current.version) {
      return candidate.version > current.version;
    }
    return candidate.received > current.received;
  }

  static readDocumentId(idDoc: string | undefined, idDocumento: string | undefined): string | null {
    // Why: the main section names the document ID_DOC and the item sections name it ID_Documento; both must give one filing id, or one reference form is stored twice, once without its link.
    return CsvUtil.readText(idDocumento ?? idDoc);
  }

  static readSecureLink(link: string | undefined): string | null {
    // Why: CVM writes the form links as http://, but the document host answers https only; the link is stored as https so the document can be read.
    const text = CsvUtil.readText(link);
    return text === null ? null : text.replace(/^http:\/\/www\.rad\.cvm\.gov\.br\//u, "https://www.rad.cvm.gov.br/");
  }

  static readSection(name: string, prefix: string, year: number): string {
    // Why: the section is the part of the file name between the dataset and the year; the main file of a dataset has no section name, so it is named principal.
    const suffix = `_${year}${CSV_SUFFIX}`;
    const middle = name.slice(prefix.length, name.length - suffix.length).replace(/^_/u, "");
    return middle === "" ? MAIN_SECTION : middle;
  }
}
