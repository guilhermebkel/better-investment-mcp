import { createHash } from "node:crypto";
import { HttpFailureError } from "@/Errors/HttpFailureError.ts";
import type { CvmFilingKind, CvmKey, CvmPeriodicKind, KnownCvmCategory, LegalIdLookup } from "@/Protocols/CvmProtocol.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import type { ProviderPort, ProviderRequest, ProviderResult, ProviderRow } from "@/Protocols/ProviderProtocol.ts";
import { ZipUtil } from "@/Utils/ZipUtil.ts";

const NOT_FOUND_STATUS = 404;
const FIRST_IPE_YEAR = 2003;
const LOOKBACK_YEARS = 2;
const BYTES_PER_MIB = 1_048_576;
const MAX_FILE_MIB = 64;
const FILING_ID_LENGTH = 32;
const SEPARATOR = ";";
const LOCAL_TIME_OFFSET = "T00:00:00-03:00";
const CNPJ_NON_DIGITS = /\D/gu;
const LINE_BREAK = /\r?\n/u;
const COLUMNS = [
  "CNPJ_Companhia", "Nome_Companhia", "Codigo_CVM", "Data_Referencia", "Categoria", "Tipo", "Especie",
  "Assunto", "Data_Entrega", "Tipo_Apresentacao", "Protocolo_Entrega", "Versao", "Link_Download",
] as const;
const PERIODIC_COLUMNS = [
  "CNPJ_CIA", "DT_REFER", "VERSAO", "DENOM_CIA", "CD_CVM", "CATEG_DOC", "ID_DOC", "DT_RECEB", "LINK_DOC",
] as const;
const PERIODIC_KINDS: readonly CvmPeriodicKind[] = ["itr", "dfp", "fre"];
const PERIODIC_FORMAT_ERROR = "the response format changed: an ITR, DFP or FRE file is not the one the adapter reads; no row was written";
const CATEGORY_TO_KIND: ReadonlyMap<KnownCvmCategory, CvmFilingKind> = new Map<KnownCvmCategory, CvmFilingKind>([
  ["Fato Relevante", "material_fact"],
  ["Relatório de Sustentabilidade", "sustainability"],
]);

export class CvmAdapter implements ProviderPort<"filings"> {
  static readonly VENDOR = "cvm";
  static readonly HOST = "dados.cvm.gov.br";
  static readonly BASE_URL = `https://${CvmAdapter.HOST}`;
  // Why: the yearly ITR zip is about 32 MB and the IPE zip about 2 MB; the catalog gives the HTTP port this limit, for CVM files only.
  static readonly MAX_FILE_BYTES = MAX_FILE_MIB * BYTES_PER_MIB;
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
      throw new Error(CvmAdapter.buildUnmappedMessage(request.market, request.ticker));
    }
    const digits = CvmAdapter.readDigits(cnpj);
    const key: CvmKey = { market: request.market, ticker: request.ticker, asset_type: request.assetType };
    const filingIdToRow = new Map<string, ProviderRow>();
    for (const year of CvmAdapter.resolveYears(this.currentYear())) {
      await this.collectIpeYear(year, digits, key, filingIdToRow);
      for (const kind of PERIODIC_KINDS) {
        await this.collectPeriodicYear(kind, year, digits, key, filingIdToRow);
      }
    }
    return { source: CvmAdapter.VENDOR, tables: { filings: [...filingIdToRow.values()] } };
  }

  static buildUnmappedMessage(market: string, ticker: string): string {
    return `cannot map ${market}:${ticker} to a CVM company; no CNPJ is known for it`;
  }

  static resolveYears(currentYear: number): number[] {
    const first = Math.max(FIRST_IPE_YEAR, currentYear - LOOKBACK_YEARS);
    return Array.from({ length: currentYear - first + 1 }, (_, index) => first + index);
  }

  static buildZipUrl(baseUrl: string, folder: string, stem: string, year: number): string {
    return `${baseUrl}/dados/CIA_ABERTA/DOC/${folder}/DADOS/${stem}_cia_aberta_${year}.zip`;
  }

  static async fetchZip(http: HttpPort, url: string): Promise<Uint8Array | undefined> {
    try {
      return await http.getBytes(url);
    } catch (error) {
      // Why: a year without a file (the current year, early in the year) is skipped; any other failure stops the load.
      if (error instanceof HttpFailureError && error.status === NOT_FOUND_STATUS) {
        return undefined;
      }
      throw error;
    }
  }

  static async* readLines(chunks: AsyncIterable<Uint8Array>): AsyncGenerator<string> {
    // Why: the file is decoded in chunks and yielded as whole lines, so the decoded file is never held in memory as one string.
    const decoder = new TextDecoder("windows-1252");
    let carry = "";
    for await (const chunk of chunks) {
      const parts = (carry + decoder.decode(chunk, { stream: true })).split(LINE_BREAK);
      carry = parts.pop() ?? "";
      for (const part of parts) {
        if (part !== "") {
          yield part;
        }
      }
    }
    const last = carry + decoder.decode();
    if (last !== "") {
      yield last;
    }
  }

  static async readRows(
    lines: AsyncIterable<string> | Iterable<string>,
    cnpjDigits: string,
    key: CvmKey,
  ): Promise<ProviderRow[]> {
    let isHeader = true;
    let isEmpty = true;
    const rows: ProviderRow[] = [];
    for await (const line of lines) {
      if (isHeader) {
        CvmAdapter.checkHeader(line);
        isHeader = false;
      } else {
        // Why: only the lines of the one company become rows, so other companies' rows are never kept.
        const row = CvmAdapter.readLine(line, cnpjDigits, key);
        if (row !== undefined) {
          rows.push(row);
        }
      }
      isEmpty = false;
    }
    if (isEmpty) {
      throw new Error("the response format changed: the IPE file is empty; no row was written");
    }
    return rows;
  }

  private static checkHeader(line: string): void {
    if (line !== COLUMNS.join(SEPARATOR)) {
      throw new Error("the response format changed: the IPE header is not the one the adapter reads; no row was written");
    }
  }

  private static readLine(line: string, cnpjDigits: string, key: CvmKey): ProviderRow | undefined {
    if (line === "") {
      return undefined;
    }
    const fields = line.split(SEPARATOR);
    if (fields.length !== COLUMNS.length) {
      throw new Error("the response format changed: an IPE line has another number of fields; no row was written");
    }
    const pairs = COLUMNS.map((column, index) => [column, fields[index] ?? ""] as const);
    const columnToValue = Object.fromEntries(pairs);
    if (CvmAdapter.readDigits(columnToValue.CNPJ_Companhia ?? "") !== cnpjDigits) {
      return undefined;
    }
    return CvmAdapter.buildRow(columnToValue, key);
  }

  static readFilingKind(category: string): CvmFilingKind {
    // Why: the IPE file holds these categories only; ITR, DFP and FRE come from their own yearly CVM datasets (readPeriodicRows), so the IPE never gives them.
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

  private async collectIpeYear(
    year: number,
    digits: string,
    key: CvmKey,
    filingIdToRow: Map<string, ProviderRow>,
  ): Promise<void> {
    const url = CvmAdapter.buildZipUrl(this.baseUrl, "IPE", "ipe", year);
    const zip = await CvmAdapter.fetchZip(this.http, url);
    if (zip === undefined) {
      return;
    }
    const lines = CvmAdapter.readLines(ZipUtil.streamEntry(zip, `ipe_cia_aberta_${year}.csv`));
    for (const row of await CvmAdapter.readRows(lines, digits, key)) {
      CvmAdapter.keep(filingIdToRow, row);
    }
  }

  private async collectPeriodicYear(
    kind: CvmPeriodicKind,
    year: number,
    digits: string,
    key: CvmKey,
    filingIdToRow: Map<string, ProviderRow>,
  ): Promise<void> {
    const url = CvmAdapter.buildZipUrl(this.baseUrl, kind.toUpperCase(), kind, year);
    const zip = await CvmAdapter.fetchZip(this.http, url);
    if (zip === undefined) {
      return;
    }
    const lines = CvmAdapter.readLines(ZipUtil.streamEntry(zip, `${kind}_cia_aberta_${year}.csv`));
    for (const row of await CvmAdapter.readPeriodicRows(lines, digits, key, kind)) {
      CvmAdapter.keep(filingIdToRow, row);
    }
  }

  static async readPeriodicRows(
    lines: AsyncIterable<string> | Iterable<string>,
    cnpjDigits: string,
    key: CvmKey,
    kind: CvmPeriodicKind,
  ): Promise<ProviderRow[]> {
    const rows: ProviderRow[] = [];
    let isHeader = true;
    for await (const line of lines) {
      if (isHeader) {
        CvmAdapter.checkPeriodicHeader(line);
        isHeader = false;
      } else {
        const row = CvmAdapter.readPeriodicLine(line, cnpjDigits, key, kind);
        if (row !== undefined) {
          rows.push(row);
        }
      }
    }
    return rows;
  }

  private static checkPeriodicHeader(line: string): void {
    if (line !== PERIODIC_COLUMNS.join(SEPARATOR)) {
      throw new Error(`${PERIODIC_FORMAT_ERROR}; the header is not the one the adapter reads`);
    }
  }

  private static readPeriodicLine(
    line: string,
    cnpjDigits: string,
    key: CvmKey,
    kind: CvmPeriodicKind,
  ): ProviderRow | undefined {
    if (line === "") {
      return undefined;
    }
    const fields = line.split(SEPARATOR);
    if (fields.length !== PERIODIC_COLUMNS.length) {
      throw new Error(`${PERIODIC_FORMAT_ERROR}; a line has another number of fields`);
    }
    const columnToValue: Readonly<Record<string, string>> = Object.fromEntries(
      PERIODIC_COLUMNS.map((column, index) => [column, fields[index] ?? ""] as const),
    );
    if (CvmAdapter.readDigits(columnToValue.CNPJ_CIA ?? "") !== cnpjDigits) {
      return undefined;
    }
    // Why: a document id is unique per delivery, so the id, the version and the link identify one filing.
    const identity = [kind, columnToValue.ID_DOC, columnToValue.VERSAO, columnToValue.LINK_DOC].join("|");
    const deliveredOn = columnToValue.DT_RECEB;
    return {
      ...key,
      filing_id: createHash("sha256").update(identity).digest("hex").slice(0, FILING_ID_LENGTH),
      filing_type: kind,
      category: columnToValue.CATEG_DOC ?? "",
      delivered_at: deliveredOn ? `${deliveredOn}${LOCAL_TIME_OFFSET}` : null,
      subject: null,
      url: CvmAdapter.readOrNull(columnToValue.LINK_DOC),
      file_hash: null,
      source: CvmAdapter.VENDOR,
    };
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

  static readDigits(cnpj: string): string {
    return cnpj.replace(CNPJ_NON_DIGITS, "");
  }
}
