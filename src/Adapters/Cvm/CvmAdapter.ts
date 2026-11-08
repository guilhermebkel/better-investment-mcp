import { createHash } from "node:crypto";
import { HttpFailureError } from "@/Errors/HttpFailureError.ts";
import type { CvmFilingKind, CvmKey, KnownCvmCategory, LegalIdLookup } from "@/Protocols/CvmProtocol.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import type { ProviderPort, ProviderRequest, ProviderResult, ProviderRow } from "@/Protocols/ProviderProtocol.ts";
import { ZipUtil } from "@/Utils/ZipUtil.ts";

const NOT_FOUND_STATUS = 404;
const FIRST_IPE_YEAR = 2003;
const LOOKBACK_YEARS = 2;
const BYTES_PER_MIB = 1_048_576;
const MAX_YEAR_FILE_MIB = 16;
const FILING_ID_LENGTH = 32;
const SEPARATOR = ";";
const LOCAL_TIME_OFFSET = "T00:00:00-03:00";
const CNPJ_NON_DIGITS = /\D/gu;
const COLUMNS = [
  "CNPJ_Companhia", "Nome_Companhia", "Codigo_CVM", "Data_Referencia", "Categoria", "Tipo", "Especie",
  "Assunto", "Data_Entrega", "Tipo_Apresentacao", "Protocolo_Entrega", "Versao", "Link_Download",
] as const;
const CATEGORY_TO_KIND: ReadonlyMap<KnownCvmCategory, CvmFilingKind> = new Map<KnownCvmCategory, CvmFilingKind>([
  ["Fato Relevante", "material_fact"],
  ["Relatório de Sustentabilidade", "sustainability"],
]);

export class CvmAdapter implements ProviderPort<"filings"> {
  static readonly VENDOR = "cvm";
  static readonly HOST = "dados.cvm.gov.br";
  static readonly BASE_URL = `https://${CvmAdapter.HOST}`;
  // Why: a yearly IPE zip is about 2 MB; the catalog gives the HTTP port this limit, explicitly, for these files only.
  static readonly MAX_YEAR_FILE_BYTES = MAX_YEAR_FILE_MIB * BYTES_PER_MIB;
  static readonly MARKETS: readonly "BR"[] = ["BR"];
  static readonly ASSET_TYPES: readonly ("stock" | "fii" | "etf")[] = ["stock", "fii", "etf"];

  readonly category = "filings";
  readonly vendor = CvmAdapter.VENDOR;
  readonly markets = CvmAdapter.MARKETS;
  readonly assetTypes = CvmAdapter.ASSET_TYPES;

  private readonly http: HttpPort;
  private readonly lookup: LegalIdLookup;
  private readonly baseUrl: string;
  private readonly currentYear: () => number;

  constructor(
    http: HttpPort,
    lookup: LegalIdLookup,
    baseUrl: string = CvmAdapter.BASE_URL,
    currentYear: () => number = () => new Date().getUTCFullYear(),
  ) {
    this.http = http;
    this.lookup = lookup;
    this.baseUrl = baseUrl;
    this.currentYear = currentYear;
  }

  async fetchTables(request: ProviderRequest): Promise<ProviderResult> {
    if (request.assetType === undefined) {
      throw new Error("CVM needs the asset type of the asset");
    }
    const cnpj = await this.lookup(request.market, request.ticker);
    if (cnpj === undefined) {
      throw new Error(`cannot map ${request.market}:${request.ticker} to a CVM company; no CNPJ is known for it`);
    }
    const digits = CvmAdapter.readDigits(cnpj);
    const key: CvmKey = { market: request.market, ticker: request.ticker, asset_type: request.assetType };
    const filingIdToRow = new Map<string, ProviderRow>();
    for (const year of this.resolveYears()) {
      const text = await this.fetchYear(year);
      if (text === undefined) {
        continue;
      }
      for (const row of CvmAdapter.readRows(text, digits, key)) {
        CvmAdapter.keep(filingIdToRow, row);
      }
    }
    return { source: CvmAdapter.VENDOR, tables: { filings: [...filingIdToRow.values()] } };
  }

  static readRows(text: string, cnpjDigits: string, key: CvmKey): ProviderRow[] {
    const [header = "", ...body] = text.split(/\r?\n/u).filter((line) => line !== "");
    if (header !== COLUMNS.join(SEPARATOR)) {
      throw new Error("the response format changed: the IPE header is not the one the adapter reads; no row was written");
    }
    const rows: ProviderRow[] = [];
    // Why: the file is read line by line and only the lines of the one company become rows, so other companies' rows are never kept.
    for (const line of body) {
      const fields = line.split(SEPARATOR);
      if (fields.length !== COLUMNS.length) {
        throw new Error("the response format changed: an IPE line has another number of fields; no row was written");
      }
      const pairs = COLUMNS.map((column, index) => [column, fields[index] ?? ""] as const);
      const columnToValue = Object.fromEntries(pairs);
      if (CvmAdapter.readDigits(columnToValue.CNPJ_Companhia ?? "") === cnpjDigits) {
        rows.push(CvmAdapter.buildRow(columnToValue, key));
      }
    }
    return rows;
  }

  static readFilingKind(category: string): CvmFilingKind {
    // Why: the IPE file holds these categories only; the quarterly, annual and reference forms come from their own CVM datasets (issue #11), so the IPE never gives itr, dfp or fre.
    const entry = [...CATEGORY_TO_KIND].find(([known]) => known === category);
    return entry?.[1] ?? "other";
  }

  private static keep(filingIdToRow: Map<string, ProviderRow>, row: ProviderRow): void {
    const id = String(row.filing_id);
    const known = filingIdToRow.get(id);
    if (known === undefined) {
      filingIdToRow.set(id, row);
      return;
    }
    if (JSON.stringify(known) !== JSON.stringify(row)) {
      throw new Error(`the CVM file repeats the filing ${id} with other content; no row was written`);
    }
  }

  private resolveYears(): number[] {
    const last = this.currentYear();
    const first = Math.max(FIRST_IPE_YEAR, last - LOOKBACK_YEARS);
    return Array.from({ length: last - first + 1 }, (_, index) => first + index);
  }

  private async fetchYear(year: number): Promise<string | undefined> {
    const url = `${this.baseUrl}/dados/CIA_ABERTA/DOC/IPE/DADOS/ipe_cia_aberta_${year}.zip`;
    try {
      const zip = await this.http.getBytes(url);
      const entry = ZipUtil.readEntry(zip, `ipe_cia_aberta_${year}.csv`);
      return new TextDecoder("windows-1252").decode(entry);
    } catch (error) {
      // Why: a year without a file (the current year, early in the year) is skipped; any other failure stops the load.
      if (error instanceof HttpFailureError && error.status === NOT_FOUND_STATUS) {
        return undefined;
      }
      throw error;
    }
  }

  private static buildRow(columnToValue: Readonly<Record<string, string>>, key: CvmKey): ProviderRow {
    const category = columnToValue.Categoria ?? "";
    // Why: a delivery has its own protocol and version, so their hash identifies one filing and a re-delivery keeps its own row.
    const parts = [columnToValue.Protocolo_Entrega, columnToValue.Versao, columnToValue.Link_Download];
    const identity = parts.map((part) => part ?? "").join("|");
    const deliveredOn = columnToValue.Data_Entrega;
    return {
      ...key,
      filing_id: createHash("sha256").update(identity).digest("hex").slice(0, FILING_ID_LENGTH),
      filing_type: CvmAdapter.readFilingKind(category),
      category,
      delivered_at: deliveredOn ? `${deliveredOn}${LOCAL_TIME_OFFSET}` : null,
      subject: CvmAdapter.readOrNull(columnToValue.Assunto),
      url: CvmAdapter.readOrNull(columnToValue.Link_Download),
      file_hash: null,
      source: CvmAdapter.VENDOR,
    };
  }

  private static readOrNull(value: string | undefined): string | null {
    return value === undefined || value === "" ? null : value;
  }

  private static readDigits(cnpj: string): string {
    return cnpj.replace(CNPJ_NON_DIGITS, "");
  }
}
