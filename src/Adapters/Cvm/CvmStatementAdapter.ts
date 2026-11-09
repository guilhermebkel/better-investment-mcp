import { CvmBaseAdapter } from "@/Adapters/Cvm/CvmBaseAdapter.ts";
import type {
  CvmPeriodicKind,
  CvmPeriodType,
  CvmScale,
  CvmStatementCandidate,
  CvmStatementColumns,
  CvmStatementEntry,
  CvmStatementScan,
  StatementSource,
} from "@/Protocols/CvmProtocol.ts";
import type { ProviderPort, ProviderRequest, ProviderResult, ProviderRow } from "@/Protocols/ProviderProtocol.ts";
import { PeriodService } from "@/Services/PeriodService.ts";
import { CvmUtil } from "@/Utils/CvmUtil.ts";
import { AssetIdUtil } from "@/Utils/AssetIdUtil.ts";
import { ZipFileUtil } from "@/Utils/ZipFileUtil.ts";
import type { PeriodStartRule } from "@/Protocols/CvmProtocol.ts";

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
const DATASET_PREFIX = "cia_aberta-doc-";

// Why: a quarter starts two months before its last month; a year or a year to date starts in January; an instant is its own day.
const MONTHS_BEFORE_QUARTER_END = 2;
const FIRST_MONTH = 1;
const ISO_DATE_LENGTH = 10;

const buildFirstDay = (year: number, month: number): string => {
  return new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, ISO_DATE_LENGTH);
};

const buildYearStart: PeriodStartRule = (year) => buildFirstDay(year, FIRST_MONTH);

const PERIOD_TYPE_TO_START: Readonly<Partial<Record<CvmPeriodType, PeriodStartRule>>> = {
  instant: (_year, _month, periodEnd) => periodEnd,
  quarter: (year, month) => buildFirstDay(year, month - MONTHS_BEFORE_QUARTER_END),
  ytd: (year) => buildFirstDay(year, FIRST_MONTH),
  year: buildYearStart,
};

export class CvmStatementAdapter extends CvmBaseAdapter implements ProviderPort<"statements"> {
  static readonly VENDOR = "cvm";
  static readonly MARKETS: readonly "BR"[] = ["BR"];
  // Why: the statements come from the company datasets only; a fund has no ITR or DFP here, so a fund request is refused by the registry.
  static readonly ASSET_TYPES: readonly "stock"[] = ["stock"];

  readonly category = "statements";
  readonly vendor = CvmStatementAdapter.VENDOR;
  readonly markets = CvmStatementAdapter.MARKETS;
  readonly assetTypes = CvmStatementAdapter.ASSET_TYPES;

  fetchTables(request: ProviderRequest): Promise<ProviderResult> {
    return super.fetchTables(request);
  }

  protected async collectTables(request: ProviderRequest): Promise<ProviderResult> {
    const defaultWindow = PeriodService.buildDefaultWindow(this.currentYear());
    const { key, cnpjDigits, window } = await CvmUtil.resolveSubject(this.lookup, request, defaultWindow);
    const scan: CvmStatementScan = {
      key,
      window,
      cnpjDigits,
      keyToCandidate: new Map(),
      files: [],
    };
    for (const year of PeriodService.readYears(window)) {
      for (const kind of STATEMENT_KINDS) {
        await this.collectKind(kind, year, scan);
      }
    }
    const rows = [...scan.keyToCandidate.values()].map((candidate) => candidate.row);
    const metrics = CvmStatementAdapter.buildMetrics(rows);
    return { source: CvmStatementAdapter.VENDOR, tables: { asset_metrics: metrics }, files: scan.files };
  }

  static buildMetrics(rows: ProviderRow[]): ProviderRow[] {
    // Why: a statement line is one metric of its statement (statement.<statement>.<code>); its period is the quarter, the year or the year to date it covers, and a balance sheet line is a single day.
    return rows.flatMap((row) => {
      const value = row.value;
      if (typeof value !== "number") {
        return [];
      }
      const assetId = AssetIdUtil.build({
        market: String(row.market), assetType: String(row.asset_type), code: String(row.ticker),
      });
      const end = String(row.period_end);
      const code = String(row.line_item).split(" ")[0] ?? "";
      const metric = `statement.${String(row.statement).toLowerCase()}.${code.replace(/\./gu, "_")}`;
      return [{
        asset_id: assetId,
        reference_time_start: CvmStatementAdapter.startOf(String(row.period_type), end),
        reference_time_end: end,
        unit: String(row.currency ?? "BRL").toLowerCase(),
        version: row.version ?? null,
        metric,
        value,
      }];
    });
  }

  static startOf(periodType: string, periodEnd: string): string {
    const [year = 0, month = 1] = periodEnd.split("-").map(Number);
    // Why: a period type the table does not hold is read as a year.
    const rule = PERIOD_TYPE_TO_START[periodType as CvmPeriodType];
    return (rule ?? buildYearStart)(year, month, periodEnd);
  }

  private async collectKind(kind: CvmPeriodicKind, year: number, scan: CvmStatementScan): Promise<void> {
    const url = CvmUtil.buildZipUrl(this.baseUrl, kind.toUpperCase(), kind, year);
    await CvmUtil.downloadCvmFile(this.http, url, { dataset: `${DATASET_PREFIX}${kind}`, year: year }, scan.files, async (zip) => {
      for (const entry of STATEMENT_ENTRIES) {
        const sourceFile = `${kind}_cia_aberta_${entry.code}_${entry.version}_${year}.csv`;
        const source: StatementSource = { statement: `${entry.code}_${entry.version}`, sourceFile };
        const lines = CvmUtil.readLines(await ZipFileUtil.openEntry(zip, sourceFile));
        await CvmStatementAdapter.scanLines(lines, source, scan);
      }
    });
  }

  private static async scanLines(
    lines: AsyncIterable<string>,
    source: StatementSource,
    scan: CvmStatementScan,
  ): Promise<void> {
    let columns: CvmStatementColumns | undefined;
    for await (const line of lines) {
      if (columns === undefined) {
        columns = CvmStatementAdapter.readColumns(line);
        continue;
      }
      const candidate = CvmStatementAdapter.readCandidate(line, columns, source, scan);
      if (candidate !== undefined && PeriodService.isWithin(scan.window, candidate.periodEnd)) {
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
    source: StatementSource,
    scan: Pick<CvmStatementScan, "cnpjDigits" | "key">,
  ): CvmStatementCandidate | undefined {
    if (line === "") {
      return undefined;
    }
    const fields = line.split(SEPARATOR);
    const readField = (index: number): string => fields[index] ?? "";
    if (CvmUtil.readDigits(readField(columns.CNPJ_CIA)) !== scan.cnpjDigits) {
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
    const version = Number(readField(columns.VERSAO));
    const row = {
      ...scan.key,
      period_end: endDate,
      period_type: periodType,
      statement: source.statement,
      line_item: `${lineCode} ${lineName}`,
      value: numericValue * factor,
      currency,
      source: CvmStatementAdapter.VENDOR,
      version,
      source_file: source.sourceFile,
    };
    return {
      key: [source.statement, startDate, endDate, lineCode].join("|"),
      referenceDate: readField(columns.DT_REFER),
      periodEnd: endDate,
      version,
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
