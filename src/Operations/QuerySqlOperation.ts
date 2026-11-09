import type { OperationData, OperationPort, OperationResult } from "@/Protocols/OperationProtocol.ts";
import type { LoadedEntry } from "@/Protocols/LoaderProtocol.ts";
import type { QuerySqlDependencies, QuerySqlInput } from "@/Protocols/QuerySqlProtocol.ts";
import { QuerySqlInputSchema } from "@/Schemas/QuerySqlSchema.ts";
import type { OutputLimitResult } from "@/Protocols/OutputLimitProtocol.ts";
import type { LoadJob, LoadJobRegistry } from "@/Protocols/LoadJobProtocol.ts";
import { LoadJobService } from "@/Services/LoadJobService.ts";
import { MetricCatalogService } from "@/Services/MetricCatalogService.ts";
import { OutputLimitService } from "@/Services/OutputLimitService.ts";

const VENDOR_KEYS: ReadonlySet<"source" | "isFallback"> = new Set(["source", "isFallback"]);
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
    + "Every asset table in the query needs a WHERE filter on asset_id (market:asset_type:code), compared with = or IN "
    + "and literal values; a query without them is refused with the filter to add. Output is limited to "
    + `${OutputLimitService.DEFAULT_LIMITS.maxRows} rows and ${OutputLimitService.DEFAULT_LIMITS.maxChars} characters, `
    + "and a cut is reported. "
    + "Returns an error when the query is refused or fails.";

  readonly name = QuerySqlOperation.NAME;
  readonly description = QuerySqlOperation.DESCRIPTION;
  readonly inputSchema = QuerySqlInputSchema;

  private readonly dependencies: QuerySqlDependencies;
  private readonly jobs: LoadJobRegistry;
  private readonly backgroundAfterMs: number;

  constructor(dependencies: QuerySqlDependencies) {
    this.dependencies = dependencies;
    this.jobs = dependencies.jobs ?? new LoadJobService(dependencies.loader);
    this.backgroundAfterMs = dependencies.backgroundAfterMs ?? LoadJobService.DEFAULT_BACKGROUND_AFTER_MS;
  }

  async execute(input: QuerySqlInput): Promise<OperationResult> {
    const verdict = await this.dependencies.guard.checkSql(input.sql);
    if (!verdict.isAccepted) {
      return { isError: true, message: verdict.message };
    }
    if (QuerySqlOperation.USES_SEARCH.test(input.sql) && this.dependencies.ensureSearchIndex !== undefined) {
      const problem = await this.dependencies.ensureSearchIndex();
      if (problem !== undefined) {
        return { isError: true, message: `The query failed: ${problem}` };
      }
    }
    const job = this.jobs.start(verdict.requirements);
    const isSettled = await LoadJobService.waitUpTo(job, this.backgroundAfterMs);
    if (isSettled && job.state === "failed") {
      throw new Error(job.error ?? "the load failed");
    }
    const loaded = isSettled ? job.entries ?? [] : [];
    const reader = await this.dependencies.openReader();
    let rows: Record<string, unknown>[];
    try {
      rows = await reader.readRows(input.sql);
    } catch (error) {
      return { isError: true, message: `The query failed: ${QuerySqlOperation.describeError(error)}` };
    } finally {
      reader.close();
    }
    return QuerySqlOperation.answer(input.sql, rows, loaded, isSettled ? undefined : job);
  }

  private static answer(
    sql: string,
    rows: Record<string, unknown>[],
    loaded: LoadedEntry[],
    pending?: LoadJob,
  ): OperationResult {
    const plainRows = rows.map(convertRow);
    // Why: the rows are in the text, which every client shows; the structured content carries only the counts and the report, so the rows are not sent twice.
    const limited = new OutputLimitService().limit(plainRows.map((row) => JSON.stringify(row)));
    const structuredResult: OperationData = {
      ...(pending === undefined ? {} : { loadingId: pending.id }),
      returnedRows: limited.returnedRows,
      truncated: limited.isTruncated,
      remainingRows: limited.remainingRows,
      remainingChars: limited.remainingChars,
      loaded: loaded.map((entry) => QuerySqlOperation.removeVendorKeys(entry)),
    };
    const message = [
      QuerySqlOperation.describePending(pending),
      QuerySqlOperation.describeRows(rows.length, limited.returnedRows, loaded),
      QuerySqlOperation.describePeriodicity(rows.length, loaded),
      QuerySqlOperation.describePeriods(loaded),
      QuerySqlOperation.describeScans(loaded),
      QuerySqlOperation.describeIndexFailures(loaded),
      QuerySqlOperation.describeFundTables(sql, rows.length),
      QuerySqlOperation.describeUnknownMetrics(sql),
      QuerySqlOperation.describeCut(limited),
    ].join("");
    return { isError: false, message: `${message}\n${limited.text}`, structuredResult };
  }

  private static removeVendorKeys(entry: LoadedEntry): Record<string, unknown> {
    // Why: the answer never names the vendor that served a load, nor whether a fallback did; that is kept in load_runs.
    return Object.fromEntries(Object.entries(entry).filter(([key]) => !VENDOR_KEYS.has(key as "source")));
  }

  private static describePending(pending: LoadJob | undefined): string {
    if (pending === undefined) {
      return "";
    }
    // Why: a row set answered while a load runs can be incomplete, so the answer says so and gives the id to follow.
    return `A load is still running in the background (id ${pending.id}) for ${LoadJobService.describe(pending)}. `
      + "The rows below are the ones already stored, so they may be incomplete. Run the same query again after a few seconds, and repeat until no load is still running; then answer from its complete rows. ";
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

  private static readonly USES_SEARCH = /\bsearch_chunks\s*\(/iu;

  static describeError(error: unknown): string {
    const text = error instanceof Error ? error.message : "unknown error";
    // Why: search_chunks is a macro over the full-text index, which a rebuild drops and creates again; while it is missing DuckDB's catalog error is named here, with the way back.
    if (text.includes("search_chunks") && text.includes("does not exist")) {
      return "search_chunks is not available: the full-text index is not built. A load of documents builds it; run the query again once that load has finished.";
    }
    return text;
  }

  private static isLoaded(entry: LoadedEntry): boolean {
    return entry.status !== "failed";
  }

  private static describePeriods(loaded: LoadedEntry[]): string {
    // Why: a failed load was not read, so its period is not a period the answer can say was loaded.
    const windows = [...new Set(loaded.flatMap((entry) => {
      if (entry.requestedPeriod === undefined || !QuerySqlOperation.isLoaded(entry)) {
        return [];
      }
      return [`${entry.requestedPeriod.from} to ${entry.requestedPeriod.to}`];
    }))];
    if (windows.length === 0) {
      return "";
    }
    return ` Reference period loaded: ${windows.join(", ")}. Each row keeps its version (version); the latest version of each row is kept.`;
  }

  private static isUsable(status: LoadedEntry["status"]): boolean {
    return USABLE_STATUSES.has(status);
  }

  private static describeUnknownMetrics(sql: string): string {
    // Why: a metric name that is not in the catalog returns no rows; the answer names it and the metrics of its group, so a gap is not read as missing data.
    const named = [
      ...[...sql.matchAll(/metric\s*=\s*'([^']+)'/giu)].map((match) => match[1] ?? ""),
      ...[...sql.matchAll(/metric\s+IN\s*\(([^)]*)\)/giu)].flatMap((match) => [...(match[1] ?? "").matchAll(/'([^']+)'/gu)].map((item) => item[1] ?? "")),
    ];
    return [...new Set(named)]
      .filter((metric) => !MetricCatalogService.isKnown(metric))
      .map((metric) => ` Metric ${metric} is not known; ${MetricCatalogService.describeGroup(metric)}.`)
      .join("");
  }

  private static describeFundTables(sql: string, rowCount: number): string {
    // Why: asset_attribute and asset_holdings hold fund data only; an empty answer for a stock from them is a wrong table, not missing data.
    const isFundTableQuery = /\basset_(attribute|holdings)\b/u.test(sql);
    if (rowCount > 0 || !isFundTableQuery || sql.includes("BR:fund:")) {
      return "";
    }
    return " asset_attribute and asset_holdings hold fund data only; for a stock or an FII, read the asset table instead.";
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
