import { createHash } from "node:crypto";
import { CvmBaseAdapter } from "@/Adapters/Cvm/CvmBaseAdapter.ts";
import { CvmFundFilingAdapter } from "@/Adapters/Cvm/CvmFundFilingAdapter.ts";
import type { CvmCollection, CvmFilingKind, CvmKey, CvmPeriodicKind, KnownCvmCategory, LegalIdLookup } from "@/Protocols/CvmProtocol.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import type { PeriodWindow } from "@/Protocols/PeriodProtocol.ts";
import type { ProviderFile, ProviderPort, ProviderRequest, ProviderResult, ProviderRow } from "@/Protocols/ProviderProtocol.ts";
import { PeriodService } from "@/Services/PeriodService.ts";
import { CvmUtil } from "@/Utils/CvmUtil.ts";
import { ZipFileUtil } from "@/Utils/ZipFileUtil.ts";

const FIRST_IPE_YEAR = 2003;
const BYTES_PER_MIB = 1_048_576;
const MAX_FILE_MIB = 64;
const FILING_ID_LENGTH = 32;
const SEPARATOR = ";";
const LOCAL_TIME_OFFSET = "T00:00:00-03:00";
const COLUMNS = [
  "CNPJ_Companhia", "Nome_Companhia", "Codigo_CVM", "Data_Referencia", "Categoria", "Tipo", "Especie",
  "Assunto", "Data_Entrega", "Tipo_Apresentacao", "Protocolo_Entrega", "Versao", "Link_Download",
] as const;
const PERIODIC_COLUMNS = [
  "CNPJ_CIA", "DT_REFER", "VERSAO", "DENOM_CIA", "CD_CVM", "CATEG_DOC", "ID_DOC", "DT_RECEB", "LINK_DOC",
] as const;
// Why: the reference form (FRE) is read by the disclosure adapter, which keeps its rows; the filings list holds only the ITR and the DFP.
const PERIODIC_KINDS: readonly CvmPeriodicKind[] = ["itr", "dfp"];
const PERIODIC_FORMAT_ERROR = "the response format changed: an ITR, DFP or FRE file is not the one the adapter reads; no row was written";
const FUND_ASSET_TYPE = "fii" as const;
const CATEGORY_TO_KIND: ReadonlyMap<KnownCvmCategory, CvmFilingKind> = new Map<KnownCvmCategory, CvmFilingKind>([
  ["Fato Relevante", "material_fact"],
  ["Relatório de Sustentabilidade", "sustainability"],
  // Why: integrated and ISSB sustainability reports are the same kind of document; category keeps the exact name, so the three stay distinguishable (issue #26).
  ["Relato Integrado", "sustainability"],
  ["Relatório de Informações Financeiras Relacionadas à Sustentabilidade - Padrão ISSB", "sustainability"],
  // Why: "Política de Sustentabilidade" is a governance policy, not a report, so it stays "other" (not in this map).
]);

export class CvmAdapter extends CvmBaseAdapter implements ProviderPort<"filings"> {
  static readonly VENDOR = "cvm";
  static readonly HOST = CvmUtil.HOST;
  static readonly BASE_URL = CvmUtil.BASE_URL;
  // Why: the yearly ITR zip is about 32 MB and the IPE zip about 2 MB; the catalog gives the HTTP port this limit, for CVM files only.
  static readonly MAX_FILE_BYTES = MAX_FILE_MIB * BYTES_PER_MIB;
  static readonly MARKETS: readonly "BR"[] = ["BR"];
  static readonly ASSET_TYPES: readonly ("stock" | "fii" | "etf")[] = ["stock", "fii", "etf"];

  readonly category = "filings";
  readonly vendor = CvmUtil.VENDOR;
  readonly markets = CvmAdapter.MARKETS;
  readonly assetTypes = CvmAdapter.ASSET_TYPES;

  private readonly fundFilings: CvmFundFilingAdapter;

  constructor(
    http: HttpPort,
    lookup: LegalIdLookup,
    baseUrl: string = CvmAdapter.BASE_URL,
    currentYear: () => number = () => new Date().getUTCFullYear(),
  ) {
    super(http, lookup, baseUrl, currentYear);
    this.fundFilings = new CvmFundFilingAdapter(http, baseUrl);
  }

  fetchTables(request: ProviderRequest): Promise<ProviderResult> {
    return super.fetchTables(request);
  }

  protected async collectTables(request: ProviderRequest): Promise<ProviderResult> {
    const defaultWindow = PeriodService.buildDefaultWindow(this.currentYear());
    const { key, cnpjDigits, window } = await CvmUtil.resolveSubject(this.lookup, request, defaultWindow);
    if (request.assetType === FUND_ASSET_TYPE) {
      const files: ProviderFile[] = [];
      const rows = await this.fundFilings.fetchFilings({ cnpjDigits, key, window, files });
      const documents = rows.map((row) => CvmUtil.buildAssetFiling(row));
      return { source: CvmUtil.VENDOR, tables: { asset_filings: documents }, files };
    }
    const collection: CvmCollection = {
      key,
      window,
      cnpjDigits,
      files: [],
      filingIdToRow: new Map<string, ProviderRow>(),
    };
    for (const year of PeriodService.readYears(window)) {
      await this.collectIpeYear(year, collection);
      for (const kind of PERIODIC_KINDS) {
        await this.collectPeriodicYear(kind, year, collection);
      }
    }
    const filings = [...collection.filingIdToRow.values()];
    const documents = filings.map((row) => CvmUtil.buildAssetFiling(row));
    return { source: CvmUtil.VENDOR, tables: { asset_filings: documents }, files: collection.files };
  }

  static async readRows(
    lines: AsyncIterable<string> | Iterable<string>,
    cnpjDigits: string,
    key: CvmKey,
    window?: PeriodWindow,
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
        const row = CvmAdapter.readLine(line, cnpjDigits, key, window);
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

  private static readLine(
    line: string,
    cnpjDigits: string,
    key: CvmKey,
    window: PeriodWindow | undefined,
  ): ProviderRow | undefined {
    if (line === "") {
      return undefined;
    }
    const fields = line.split(SEPARATOR);
    if (fields.length !== COLUMNS.length) {
      throw new Error("the response format changed: an IPE line has another number of fields; no row was written");
    }
    const pairs = COLUMNS.map((column, index) => [column, fields[index] ?? ""] as const);
    const columnToValue = Object.fromEntries(pairs);
    if (CvmUtil.readDigits(columnToValue.CNPJ_Companhia ?? "") !== cnpjDigits) {
      return undefined;
    }
    if (!PeriodService.isDateInWindow(window, columnToValue.Data_Referencia ?? "")) {
      return undefined;
    }
    return CvmAdapter.buildRow(columnToValue, key);
  }

  static readFilingKind(category: string): CvmFilingKind {
    // Why: the IPE file holds these categories only; ITR, DFP and FRE come from their own yearly CVM datasets (readPeriodicRows), so the IPE never gives them.
    const entry = [...CATEGORY_TO_KIND].find(([known]) => known === category);
    return entry?.[1] ?? "other";
  }

  private async collectIpeYear(year: number, collection: CvmCollection): Promise<void> {
    if (year < FIRST_IPE_YEAR) {
      return;
    }
    const url = CvmUtil.buildZipUrl(this.baseUrl, "IPE", "ipe", year);
    const rows = await CvmUtil.downloadCvmFile(this.http, url, { dataset: "cia_aberta-doc-ipe", year: year }, collection.files, async (zip) => {
      const lines = CvmUtil.readLines(await ZipFileUtil.openEntry(zip, `ipe_cia_aberta_${year}.csv`));
      return CvmAdapter.readRows(lines, collection.cnpjDigits, collection.key, collection.window);
    });
    for (const row of rows ?? []) {
      CvmUtil.keep(collection.filingIdToRow, row);
    }
  }

  private async collectPeriodicYear(kind: CvmPeriodicKind, year: number, collection: CvmCollection): Promise<void> {
    const url = CvmUtil.buildZipUrl(this.baseUrl, kind.toUpperCase(), kind, year);
    const dataset = `cia_aberta-doc-${kind}`;
    const key = { dataset, year };
    const rows = await CvmUtil.downloadCvmFile(this.http, url, key, collection.files, async (zip) => {
      const lines = CvmUtil.readLines(await ZipFileUtil.openEntry(zip, `${kind}_cia_aberta_${year}.csv`));
      return CvmAdapter.readPeriodicRows(lines, collection.cnpjDigits, collection.key, kind, collection.window);
    });
    for (const row of rows ?? []) {
      CvmUtil.keep(collection.filingIdToRow, row);
    }
  }

  static async readPeriodicRows(
    lines: AsyncIterable<string> | Iterable<string>,
    cnpjDigits: string,
    key: CvmKey,
    kind: CvmPeriodicKind,
    window?: PeriodWindow,
  ): Promise<ProviderRow[]> {
    const rows: ProviderRow[] = [];
    let isHeader = true;
    for await (const line of lines) {
      if (isHeader) {
        CvmAdapter.checkPeriodicHeader(line);
        isHeader = false;
      } else {
        const row = CvmAdapter.readPeriodicLine(line, cnpjDigits, key, kind, window);
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
    window: PeriodWindow | undefined,
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
    if (CvmUtil.readDigits(columnToValue.CNPJ_CIA ?? "") !== cnpjDigits) {
      return undefined;
    }
    if (!PeriodService.isDateInWindow(window, columnToValue.DT_REFER ?? "")) {
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
      reference_date: CvmUtil.readOrNull(columnToValue.DT_REFER),
      delivered_at: deliveredOn ? `${deliveredOn}${LOCAL_TIME_OFFSET}` : null,
      subject: null,
      url: CvmUtil.readOrNull(columnToValue.LINK_DOC),
      file_hash: null,
      source: CvmUtil.VENDOR,
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
      reference_date: CvmUtil.readOrNull(columnToValue.Data_Referencia),
      delivered_at: deliveredOn ? `${deliveredOn}${LOCAL_TIME_OFFSET}` : null,
      subject: CvmUtil.readOrNull(columnToValue.Assunto),
      url: CvmUtil.readOrNull(columnToValue.Link_Download),
      file_hash: null,
      source: CvmUtil.VENDOR,
    };
  }
}
