import type { OperationData, OperationPort, OperationResult } from "@/Protocols/OperationProtocol.ts";
import type { LoadedEntry } from "@/Protocols/LoaderProtocol.ts";
import type { QuerySqlDependencies, QuerySqlInput } from "@/Protocols/QuerySqlProtocol.ts";
import { QuerySqlInputSchema } from "@/Schemas/QuerySqlSchema.ts";
import type { OutputLimitResult } from "@/Protocols/OutputLimitProtocol.ts";
import { OutputLimitService } from "@/Services/OutputLimitService.ts";

const USABLE_STATUSES: ReadonlySet<LoadedEntry["status"]> = new Set<LoadedEntry["status"]>(["loaded", "fresh"]);

const convertValue = (value: unknown): unknown => {
  // Why: the agent's JSON cannot hold a bigint, so counts that DuckDB returns as bigint become numbers.
  return typeof value === "bigint" ? Number(value) : value;
};
const convertRow = (row: Record<string, unknown>): Record<string, unknown> => {
  return Object.fromEntries(Object.entries(row).map(([name, value]) => [name, convertValue(value)]));
};

export class QuerySqlOperation implements OperationPort<QuerySqlInput> {
  static readonly NAME = "querySql";
  static readonly DESCRIPTION = "Read-only. Runs one SELECT over the server's tables and returns the rows. "
    + "Every data table in the query needs WHERE filters on market, ticker and asset_type, compared with = or IN "
    + "and literal values; a query without them is refused with the filter to add. Output is limited to "
    + `${OutputLimitService.DEFAULT_LIMITS.maxRows} rows and ${OutputLimitService.DEFAULT_LIMITS.maxChars} characters, `
    + "and a cut is reported. "
    + "Returns an error when the query is refused or fails.";

  readonly name = QuerySqlOperation.NAME;
  readonly description = QuerySqlOperation.DESCRIPTION;
  readonly inputSchema = QuerySqlInputSchema;

  private readonly dependencies: QuerySqlDependencies;

  constructor(dependencies: QuerySqlDependencies) {
    this.dependencies = dependencies;
  }

  async execute(input: QuerySqlInput): Promise<OperationResult> {
    const verdict = await this.dependencies.guard.checkSql(input.sql);
    if (!verdict.isAccepted) {
      return { isError: true, message: verdict.message };
    }
    const loaded = await this.dependencies.loader.ensure(verdict.requirements);
    const reader = await this.dependencies.openReader();
    let rows: Record<string, unknown>[];
    try {
      rows = await reader.readRows(input.sql);
    } catch (error) {
      return { isError: true, message: `The query failed: ${error instanceof Error ? error.message : "unknown error"}` };
    } finally {
      reader.close();
    }
    return QuerySqlOperation.answer(rows, loaded);
  }

  private static answer(rows: Record<string, unknown>[], loaded: LoadedEntry[]): OperationResult {
    const plainRows = rows.map(convertRow);
    const limited = new OutputLimitService().limit(plainRows.map((row) => JSON.stringify(row)));
    const structuredResult: OperationData = {
      rows: plainRows.slice(0, limited.returnedRows),
      truncated: limited.isTruncated,
      remainingRows: limited.remainingRows,
      remainingChars: limited.remainingChars,
      loaded,
    };
    const message = [
      QuerySqlOperation.describeRows(rows.length, limited.returnedRows, loaded),
      QuerySqlOperation.describePeriodicity(rows.length, loaded),
      QuerySqlOperation.describePeriods(loaded),
      QuerySqlOperation.describeScans(loaded),
      QuerySqlOperation.describeIndexFailures(loaded),
      QuerySqlOperation.describeCut(limited),
    ].join("");
    return { isError: false, message: `${message}\n${limited.text}`, structuredResult };
  }

  private static describeRows(rowCount: number, returnedRows: number, loaded: LoadedEntry[]): string {
    const unloaded = loaded.filter((entry) => entry.status === "failed");
    if (rowCount > 0) {
      return `${returnedRows} rows.`;
    }
    if (unloaded.length > 0) {
      // Why: an empty answer for an asset that failed to load says so, so the agent does not read it as "no data".
      const causes = unloaded.map((entry) => entry.error ?? "unknown error").join("; ");
      return `No rows. Some assets were not loaded: ${causes}. Check loaded for each asset.`;
    }
    const isIndexed = loaded.some((entry) => entry.category === "documents" && QuerySqlOperation.isUsable(entry.status));
    // Why: a document that was indexed and has no match is not the same as a document that was not loaded.
    return isIndexed ? "0 rows. The filing was indexed, and no row matches the query." : "0 rows.";
  }

  private static describePeriodicity(rowCount: number, loaded: LoadedEntry[]): string {
    const [periodicity] = loaded.flatMap((entry) => (entry.periodicity === undefined ? [] : [entry.periodicity]));
    // Why: an empty month of a table published quarterly or yearly is explained with its periodicity, so it is not read as missing data (issue #28, AC9).
    return rowCount === 0 && periodicity !== undefined ? ` Published periodicity: ${periodicity}.` : "";
  }

  private static describePeriods(loaded: LoadedEntry[]): string {
    const windows = [...new Set(loaded.flatMap((entry) => {
      return entry.requestedPeriod === undefined ? [] : [`${entry.requestedPeriod.from} to ${entry.requestedPeriod.to}`];
    }))];
    if (windows.length === 0) {
      return "";
    }
    return ` Reference period loaded: ${windows.join(", ")}. Each row keeps its version (version) and its file (source_file); the latest version of each row is kept.`;
  }

  private static isUsable(status: LoadedEntry["status"]): boolean {
    return USABLE_STATUSES.has(status);
  }

  private static describeCut(limited: OutputLimitResult): string {
    if (!limited.isTruncated) {
      return "";
    }
    return ` The answer was cut: ${limited.remainingRows} rows and ${limited.remainingChars} characters were left out. Narrow the query to get the rest.`;
  }

  private static describeScans(loaded: LoadedEntry[]): string {
    const pagesWithoutText = loaded.reduce((total, entry) => total + (entry.pagesWithoutText ?? 0), 0);
    return pagesWithoutText > 0 ? ` ${pagesWithoutText} pages had no text (scanned images are not read; OCR is not available).` : "";
  }

  private static describeIndexFailures(loaded: LoadedEntry[]): string {
    const [firstFailure] = loaded.flatMap((entry) => (entry.indexError === undefined ? [] : [entry.indexError]));
    return firstFailure === undefined ? "" : ` The search index was not rebuilt, so search_chunks may be out of date: ${firstFailure}`;
  }
}
