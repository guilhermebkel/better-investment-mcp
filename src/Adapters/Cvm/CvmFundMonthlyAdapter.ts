import { CvmBaseAdapter } from "@/Adapters/Cvm/CvmBaseAdapter.ts";
import type { ColumnPairs, CvmFundColumn, CvmFundMonth, CvmKey, FileScope, FundMonthField, NonMetricColumn } from "@/Protocols/CvmProtocol.ts";
import type { ProviderFile, ProviderPort, ProviderRequest, ProviderResult, ProviderRow } from "@/Protocols/ProviderProtocol.ts";
import { PeriodService } from "@/Services/PeriodService.ts";
import { CvmUtil } from "@/Utils/CvmUtil.ts";
import { AssetIdUtil } from "@/Utils/AssetIdUtil.ts";
import { ZipFileUtil } from "@/Utils/ZipFileUtil.ts";

const SEPARATOR = ";";
const DATASET = "fii-doc-inf_mensal";
const FORMAT_ERROR = "the response format changed: a CVM monthly fund file is not the one the adapter reads; no row was written";
const CNPJ_COLUMN = "CNPJ_Fundo_Classe";
const REFERENCE_COLUMN = "Data_Referencia";
const VERSION_COLUMN = "Versao";
const COMPLEMENT_FILE = "complemento";
const ASSET_LIABILITY_FILE = "ativo_passivo";
// Why: each CVM column maps to one fii metric of its month; the net worth is the complement file's, the liquidity and the balance items are the balance sheet file's.
const COMPLEMENT_COLUMNS: readonly (readonly [CvmFundColumn, FundMonthField])[] = [
  ["Patrimonio_Liquido", "net_worth"],
];
const ASSET_LIABILITY_COLUMNS: readonly (readonly [CvmFundColumn, FundMonthField])[] = [
  ["Total_Necessidades_Liquidez", "liquidity_requirement"],
  ["Disponibilidades", "cash_available"],
  ["Titulos_Publicos", "government_bonds"],
  ["Titulos_Privados", "corporate_bonds"],
  ["Fundos_Renda_Fixa", "fixed_income_funds"],
  ["Rendimentos_Distribuir", "distributable_income"],
];

export class CvmFundMonthlyAdapter extends CvmBaseAdapter implements ProviderPort<"fund_data"> {
  static readonly VENDOR = "cvm";
  static readonly MARKETS: readonly "BR"[] = ["BR"];
  static readonly ASSET_TYPES: readonly "fii"[] = ["fii"];

  readonly category = "fund_data";
  readonly vendor = CvmFundMonthlyAdapter.VENDOR;
  readonly markets = CvmFundMonthlyAdapter.MARKETS;
  readonly assetTypes = CvmFundMonthlyAdapter.ASSET_TYPES;

  fetchTables(request: ProviderRequest): Promise<ProviderResult> {
    return super.fetchTables(request);
  }

  protected async collectTables(request: ProviderRequest): Promise<ProviderResult> {
    const defaultWindow = PeriodService.buildDefaultWindow(this.currentYear());
    const { key, cnpjDigits, window } = await CvmUtil.resolveSubject(this.lookup, request, defaultWindow);
    const files: ProviderFile[] = [];
    const periodToMonth = new Map<string, CvmFundMonth>();
    const scope: FileScope = { cnpjDigits, window, periodToMonth };
    for (const year of PeriodService.readYears(window)) {
      const url = `${this.baseUrl}/dados/FII/DOC/INF_MENSAL/DADOS/inf_mensal_fii_${year}.zip`;
      await CvmUtil.downloadCvmFile(this.http, url, { dataset: DATASET, year: year }, files, async (zip) => {
        await CvmFundMonthlyAdapter.readFile(zip, year, COMPLEMENT_FILE, COMPLEMENT_COLUMNS, scope);
        await CvmFundMonthlyAdapter.readFile(zip, year, ASSET_LIABILITY_FILE, ASSET_LIABILITY_COLUMNS, scope);
      });
    }
    const rows = [...periodToMonth].map(([period, month]) => CvmFundMonthlyAdapter.buildRow(key, period, month));
    const metrics = CvmFundMonthlyAdapter.buildMetrics(rows);
    return { source: CvmFundMonthlyAdapter.VENDOR, tables: { asset_metrics: metrics }, files };
  }

  private static async readFile(
    zip: string,
    year: number,
    fileKind: string,
    columns: ColumnPairs,
    scope: FileScope,
  ): Promise<void> {
    const sourceFile = `inf_mensal_fii_${fileKind}_${year}.csv`;
    const lines = CvmUtil.readLines(await ZipFileUtil.openEntry(zip, sourceFile));
    await CvmFundMonthlyAdapter.readLines(lines, sourceFile, columns, scope);
  }

  private static async readLines(
    lines: AsyncIterable<string>,
    sourceFile: string,
    columns: ColumnPairs,
    scope: FileScope,
  ): Promise<void> {
    let nameToIndex: ReadonlyMap<string, number> | undefined;
    for await (const line of lines) {
      if (nameToIndex === undefined) {
        nameToIndex = CvmFundMonthlyAdapter.readIndexes(line, columns);
        continue;
      }
      CvmFundMonthlyAdapter.keepLine(line, nameToIndex, columns, sourceFile, scope);
    }
  }

  private static readIndexes(header: string, columns: ColumnPairs): ReadonlyMap<string, number> {
    const names = header.split(SEPARATOR);
    const wanted: string[] = [CNPJ_COLUMN, REFERENCE_COLUMN, VERSION_COLUMN, ...columns.map(([column]) => column)];
    const entries = wanted.map((name) => {
      const index = names.indexOf(name);
      if (index < 0) {
        throw new Error(`${FORMAT_ERROR}; the column ${name} is missing`);
      }
      return [name, index] as const;
    });
    return new Map(entries);
  }

  private static keepLine(
    line: string,
    nameToIndex: ReadonlyMap<string, number>,
    columns: ColumnPairs,
    sourceFile: string,
    scope: FileScope,
  ): void {
    if (line === "") {
      return;
    }
    const fields = line.split(SEPARATOR);
    const readField = (name: string): string => fields[nameToIndex.get(name) ?? -1] ?? "";
    // Why: a fund's monthly rows are kept only for its own CNPJ, so another fund's figures never reach the ticker (issue #28, S5).
    if (CvmUtil.readDigits(readField(CNPJ_COLUMN)) !== scope.cnpjDigits) {
      return;
    }
    const period = readField(REFERENCE_COLUMN);
    if (!PeriodService.isDateInWindow(scope.window, period)) {
      return;
    }
    const version = Number(readField(VERSION_COLUMN));
    if (Number.isNaN(version)) {
      throw new Error(`${FORMAT_ERROR}; a version is not a number`);
    }
    const fieldToValue = CvmFundMonthlyAdapter.readValues(readField, columns);
    const known = scope.periodToMonth.get(period);
    const incoming: CvmFundMonth = { version, fieldToValue, sourceFiles: [sourceFile] };
    scope.periodToMonth.set(period, CvmFundMonthlyAdapter.mergeMonth(known, incoming));
  }

  private static readValues(readField: (name: string) => string, columns: ColumnPairs): CvmFundMonth["fieldToValue"] {
    const entries = columns.map(([column, field]) => {
      const raw = readField(column);
      return [field, CvmFundMonthlyAdapter.readNumber(raw)] as const;
    });
    return Object.fromEntries(entries);
  }

  private static mergeMonth(known: CvmFundMonth | undefined, incoming: CvmFundMonth): CvmFundMonth {
    if (known === undefined) {
      return incoming;
    }
    // Why: a month read from two files keeps the later version of the two, and each file's own values; a missing value stays null, never zero.
    return {
      version: Math.max(known.version, incoming.version),
      sourceFiles: [...known.sourceFiles, ...incoming.sourceFiles],
      fieldToValue: { ...known.fieldToValue, ...incoming.fieldToValue },
    };
  }

  private static readNumber(raw: string): number | null {
    if (raw === "") {
      return null;
    }
    const value = Number(raw);
    if (Number.isNaN(value)) {
      throw new Error(`${FORMAT_ERROR}; a value is not a number`);
    }
    return value;
  }

  static buildMetrics(rows: ProviderRow[]): ProviderRow[] {
    // Why: a monthly FII value is one metric row (fii.<column>) of its month; a value CVM does not carry is no row, not a zero.
    return rows.flatMap((row) => {
      const assetId = AssetIdUtil.build({
        market: String(row.market), assetType: String(row.asset_type), code: String(row.ticker),
      });
      const start = String(row.period);
      const end = PeriodService.endOfMonth(start);
      return Object.entries(row)
        // Why: a column the file carries but leaves empty is kept as null, so a missing month is not read as one that was never loaded; a column the file does not carry is not a row at all.
        .filter(([column, value]) => CvmFundMonthlyAdapter.isMetricColumn(column) && (value === null || typeof value === "number"))
        .map(([column, value]) => ({
          asset_id: assetId,
          metric: `fii.${column}`,
          reference_time_start: start,
          reference_time_end: end,
          unit: "brl",
          version: row.version ?? null,
          value,
        }));
    });
  }

  private static readonly NON_METRIC_COLUMNS: readonly NonMetricColumn[] = ["market", "ticker", "asset_type", "period", "version", "source_file", "source"];

  private static isMetricColumn(column: string): boolean {
    return !CvmFundMonthlyAdapter.NON_METRIC_COLUMNS.some((known) => known === column);
  }

  private static buildRow(key: CvmKey, period: string, month: CvmFundMonth): ProviderRow {
    return {
      ...key,
      period,
      ...month.fieldToValue,
      source: CvmFundMonthlyAdapter.VENDOR,
      version: month.version,
      source_file: month.sourceFiles.join(" + "),
    };
  }
}
