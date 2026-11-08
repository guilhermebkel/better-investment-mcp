import { CvmAdapter } from "@/Adapters/Cvm/CvmAdapter.ts";
import type {
  CvmKey,
  CvmPeriodicKind,
  CvmPeriodType,
  CvmScale,
  CvmStatementCandidate,
  CvmStatementColumns,
  CvmStatementEntry,
  CvmStatementScan,
  LegalIdLookup,
} from "@/Protocols/CvmProtocol.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import type { ProviderPort, ProviderRequest, ProviderResult } from "@/Protocols/ProviderProtocol.ts";
import { ZipUtil } from "@/Utils/ZipUtil.ts";

const THOUSAND = 1000;
const ONE = 1;
const MS_PER_DAY = 86_400_000;
const QUARTER_MAX_DAYS = 100;
const YEAR_MIN_DAYS = 350;
const SEPARATOR = ";";
const CURRENCY_REAL = "REAL";
const CURRENCY_CODE_REAL = "BRL";
const STATEMENT_KINDS: readonly CvmPeriodicKind[] = ["itr", "dfp"];
const STATEMENT_ENTRIES: readonly CvmStatementEntry[] = [
  { code: "DRE", version: "con" },
  { code: "DRE", version: "ind" },
  { code: "BPA", version: "con" },
  { code: "BPA", version: "ind" },
  { code: "BPP", version: "con" },
  { code: "BPP", version: "ind" },
  { code: "DFC_MD", version: "con" },
  { code: "DFC_MD", version: "ind" },
];
const SCALE_TO_FACTOR: Readonly<Record<CvmScale, number>> = { MIL: THOUSAND, UNIDADE: ONE };
const FORMAT_ERROR = "the response format changed: a CVM statement file is not the one the adapter reads; no row was written";

export class CvmStatementAdapter implements ProviderPort<"statements"> {
  static readonly VENDOR = "cvm";
  static readonly MARKETS: readonly "BR"[] = ["BR"];
  static readonly ASSET_TYPES: readonly ("stock" | "fii" | "etf")[] = ["stock", "fii", "etf"];

  readonly category = "statements";
  readonly vendor = CvmStatementAdapter.VENDOR;
  readonly markets = CvmStatementAdapter.MARKETS;
  readonly assetTypes = CvmStatementAdapter.ASSET_TYPES;

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
    const key: CvmKey = { market: request.market, ticker: request.ticker, asset_type: request.assetType };
    const scan: CvmStatementScan = { key, cnpjDigits: CvmAdapter.readDigits(cnpj), keyToCandidate: new Map() };
    for (const year of CvmAdapter.resolveYears(this.currentYear())) {
      for (const kind of STATEMENT_KINDS) {
        await this.collectKind(kind, year, scan);
      }
    }
    const rows = [...scan.keyToCandidate.values()].map((candidate) => candidate.row);
    return { source: CvmStatementAdapter.VENDOR, tables: { financial_statements: rows } };
  }

  private async collectKind(kind: CvmPeriodicKind, year: number, scan: CvmStatementScan): Promise<void> {
    const url = CvmAdapter.buildZipUrl(this.baseUrl, kind.toUpperCase(), kind, year);
    const zip = await CvmAdapter.fetchZip(this.http, url);
    if (zip === undefined) {
      return;
    }
    for (const entry of STATEMENT_ENTRIES) {
      const entryName = `${kind}_cia_aberta_${entry.code}_${entry.version}_${year}.csv`;
      const lines = CvmAdapter.readLines(ZipUtil.streamEntry(zip, entryName));
      await CvmStatementAdapter.scanLines(lines, entry, scan);
    }
  }

  private static async scanLines(
    lines: AsyncIterable<string>,
    entry: CvmStatementEntry,
    scan: CvmStatementScan,
  ): Promise<void> {
    const statement = `${entry.code}_${entry.version}`;
    let columns: CvmStatementColumns | undefined;
    for await (const line of lines) {
      if (columns === undefined) {
        columns = CvmStatementAdapter.readColumns(line);
        continue;
      }
      const candidate = CvmStatementAdapter.readCandidate(line, columns, statement, scan);
      if (candidate !== undefined) {
        CvmStatementAdapter.keepLatest(scan.keyToCandidate, candidate);
      }
    }
  }

  static readColumns(header: string): CvmStatementColumns {
    const names = header.split(SEPARATOR);
    const indexOf = (column: string): number => {
      const index = names.indexOf(column);
      if (index < 0) {
        throw new Error(`${FORMAT_ERROR}; the column ${column} is missing`);
      }
      return index;
    };
    const dtIniIndex = names.indexOf("DT_INI_EXERC");
    return {
      CNPJ_CIA: indexOf("CNPJ_CIA"),
      DT_REFER: indexOf("DT_REFER"),
      VERSAO: indexOf("VERSAO"),
      MOEDA: indexOf("MOEDA"),
      ESCALA_MOEDA: indexOf("ESCALA_MOEDA"),
      DT_INI_EXERC: dtIniIndex < 0 ? undefined : dtIniIndex,
      DT_FIM_EXERC: indexOf("DT_FIM_EXERC"),
      CD_CONTA: indexOf("CD_CONTA"),
      DS_CONTA: indexOf("DS_CONTA"),
      VL_CONTA: indexOf("VL_CONTA"),
    };
  }

  static readCandidate(
    line: string,
    columns: CvmStatementColumns,
    statement: string,
    scan: CvmStatementScan,
  ): CvmStatementCandidate | undefined {
    if (line === "") {
      return undefined;
    }
    const fields = line.split(SEPARATOR);
    const readField = (index: number): string => fields[index] ?? "";
    if (CvmAdapter.readDigits(readField(columns.CNPJ_CIA)) !== scan.cnpjDigits) {
      return undefined;
    }
    const startDate = columns.DT_INI_EXERC === undefined ? "" : readField(columns.DT_INI_EXERC);
    const endDate = readField(columns.DT_FIM_EXERC);
    const value = readField(columns.VL_CONTA);
    // Why: a line without a value is not a zero; it is left out, so a missing period is absent and not 0.
    if (value === "") {
      return undefined;
    }
    const factor = CvmStatementAdapter.readScale(readField(columns.ESCALA_MOEDA));
    const numericValue = Number(value);
    if (Number.isNaN(numericValue)) {
      throw new Error(`${FORMAT_ERROR}; a value is not a number`);
    }
    const lineCode = readField(columns.CD_CONTA);
    const lineName = readField(columns.DS_CONTA);
    const periodType = CvmStatementAdapter.readPeriodType(startDate, endDate);
    const currency = CvmStatementAdapter.readCurrency(readField(columns.MOEDA));
    const row = {
      ...scan.key,
      period_end: endDate,
      period_type: periodType,
      statement,
      line_item: `${lineCode} ${lineName}`,
      value: numericValue * factor,
      currency,
      source: CvmStatementAdapter.VENDOR,
    };
    return {
      key: [statement, startDate, endDate, lineCode].join("|"),
      referenceDate: readField(columns.DT_REFER),
      version: Number(readField(columns.VERSAO)),
      row,
    };
  }

  static keepLatest(keyToCandidate: Map<string, CvmStatementCandidate>, candidate: CvmStatementCandidate): void {
    const known = keyToCandidate.get(candidate.key);
    if (known === undefined || CvmStatementAdapter.isNewer(candidate, known)) {
      keyToCandidate.set(candidate.key, candidate);
    }
  }

  private static isNewer(candidate: CvmStatementCandidate, known: CvmStatementCandidate): boolean {
    // Why: a restated period comes in a later filing with a higher version; the later filing date decides first, then the version.
    if (candidate.referenceDate !== known.referenceDate) {
      return candidate.referenceDate > known.referenceDate;
    }
    return candidate.version > known.version;
  }

  static readScale(scale: string): number {
    if (!CvmStatementAdapter.isScale(scale)) {
      throw new Error(`${FORMAT_ERROR}; the scale ${scale} is unknown`);
    }
    return SCALE_TO_FACTOR[scale];
  }

  private static isScale(scale: string): scale is CvmScale {
    return Object.hasOwn(SCALE_TO_FACTOR, scale);
  }

  static readPeriodType(startDate: string, endDate: string): CvmPeriodType {
    if (startDate === "") {
      return "instant";
    }
    const days = (Date.parse(endDate) - Date.parse(startDate)) / MS_PER_DAY + ONE;
    if (days <= QUARTER_MAX_DAYS) {
      return "quarter";
    }
    return days >= YEAR_MIN_DAYS ? "year" : "ytd";
  }

  static readCurrency(currency: string): string {
    // Why: a currency other than the real is kept as the file names it, so an unmapped value stays visible.
    return currency === CURRENCY_REAL ? CURRENCY_CODE_REAL : currency;
  }
}
