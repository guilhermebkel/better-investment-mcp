import type { CacheLoadResult } from "@/Protocols/CacheProtocol.ts";
import type { Requirement } from "@/Protocols/SqlGuardProtocol.ts";
import type { FetchAttempt, FetchOutcome, LoadedEntry, LoaderPort, TableToColumns } from "@/Protocols/LoaderProtocol.ts";
import type { ProviderPort, ProviderRequest, ProviderRow, ProviderResult, ResolvedProviders, TableToRows } from "@/Protocols/ProviderProtocol.ts";
import { PeriodRowsSchema } from "@/Schemas/CacheSchema.ts";
import { ProviderResultSchema } from "@/Schemas/ProviderSchema.ts";
import type { ProviderRegistryService } from "@/Services/ProviderRegistryService.ts";
import { SqlGuardService } from "@/Services/SqlGuardService.ts";
import type { StoreService } from "@/Services/StoreService.ts";
import { ConcurrencyUtil } from "@/Utils/ConcurrencyUtil.ts";

const MACRO_TABLE = "macro_series";
const ASSET_KEY_COLUMNS: readonly ("market" | "ticker")[] = ["market", "ticker"];
const SERIES_KEY_COLUMNS: readonly "series"[] = ["series"];

export class LoaderService implements LoaderPort {
  static readonly MAX_PARALLEL_LOADS = 4;
  static readonly WRITABLE_TABLES: ReadonlySet<string> = new Set([...Object.keys(SqlGuardService.TABLE_TO_CATEGORY), "assets"]);

  private readonly store: StoreService;
  private readonly registry: ProviderRegistryService;
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(store: StoreService, registry: ProviderRegistryService) {
    this.store = store;
    this.registry = registry;
  }

  async ensure(requirements: readonly Requirement[]): Promise<LoadedEntry[]> {
    const buildKey = (requirement: Requirement): string => {
      return [requirement.category, requirement.market, requirement.ticker, requirement.assetType ?? ""].join("|");
    };
    const keyToRequirement = new Map(requirements.map((requirement) => [buildKey(requirement), requirement]));
    const uniqueRequirements = [...keyToRequirement.values()];
    const ensureOne = (requirement: Requirement): Promise<LoadedEntry> => this.ensureOne(requirement);
    return ConcurrencyUtil.mapWithLimit(uniqueRequirements, LoaderService.MAX_PARALLEL_LOADS, ensureOne);
  }

  private async ensureOne(requirement: Requirement): Promise<LoadedEntry> {
    const { cache } = this.store;
    const base = {
      category: requirement.category,
      market: requirement.market,
      ticker: requirement.ticker,
      isFallback: false,
      rowsWritten: 0,
    };
    if (await cache.isFresh(requirement.category, requirement.market, requirement.ticker)) {
      const source = await cache.readLastSource(requirement.category, requirement.market, requirement.ticker);
      const period = await this.readPeriod(requirement);
      return { ...base, status: "fresh", ...(source === undefined ? {} : { source }), ...(period === undefined ? {} : { period }) };
    }
    const { category, market, ticker } = requirement;
    const result = await cache.runOnce(category, market, ticker, () => this.load(requirement));
    const error = result.errorMessage === undefined ? {} : { error: result.errorMessage };
    const period = await this.readPeriod(requirement);
    return {
      ...base,
      status: result.errorMessage === undefined ? "loaded" : "failed",
      source: result.source,
      isFallback: result.isFallback,
      rowsWritten: result.rowsWritten,
      ...(period === undefined ? {} : { period }),
      ...error,
    };
  }

  private async load(requirement: Requirement): Promise<CacheLoadResult> {
    let resolved: ResolvedProviders;
    try {
      // Why: the provider is called before anything is written, so a failed call leaves the rows of the previous load in place.
      resolved = this.registry.resolve(requirement.category, requirement.market, requirement.assetType);
    } catch (error) {
      return { rowsWritten: 0, isFallback: false, errorMessage: LoaderService.describe(error) };
    }
    const fetched = await this.fetchWithFallback(resolved, requirement);
    const runId = await this.store.cache.startRun({
      category: requirement.category,
      market: requirement.market,
      ticker: requirement.ticker,
      source: fetched.vendor,
    });
    if (fetched.result === undefined) {
      await this.store.cache.finishRun(runId, { rowsRead: 0, errorMessage: fetched.errorMessage });
      return {
        rowsWritten: 0,
        source: fetched.vendor,
        isFallback: fetched.isFallback,
        errorMessage: fetched.errorMessage,
      };
    }
    try {
      const rowsWritten = await this.writeInTransaction(requirement, fetched.result.tables);
      await this.store.cache.finishRun(runId, { rowsRead: rowsWritten });
      return { rowsWritten, source: fetched.vendor, isFallback: fetched.isFallback };
    } catch (error) {
      const errorMessage = LoaderService.describe(error);
      await this.store.cache.finishRun(runId, { rowsRead: 0, errorMessage });
      return { rowsWritten: 0, source: fetched.vendor, isFallback: fetched.isFallback, errorMessage };
    }
  }

  private async fetchWithFallback(resolved: ResolvedProviders, requirement: Requirement): Promise<FetchOutcome> {
    const request: ProviderRequest = {
      market: requirement.market,
      ticker: requirement.ticker,
      assetType: requirement.assetType,
    };
    const primaryAttempt = await LoaderService.fetchOnce(resolved.primary, request);
    if (primaryAttempt.result !== undefined || resolved.fallback === undefined) {
      return { ...primaryAttempt, vendor: resolved.primary.vendor, isFallback: false };
    }
    const fallbackAttempt = await LoaderService.fetchOnce(resolved.fallback, request);
    return { ...fallbackAttempt, vendor: resolved.fallback.vendor, isFallback: true };
  }

  private static async fetchOnce(provider: ProviderPort, request: ProviderRequest): Promise<FetchAttempt> {
    try {
      const result: ProviderResult = ProviderResultSchema.parse(await provider.fetchTables(request));
      return { result, errorMessage: undefined };
    } catch (error) {
      return { result: undefined, errorMessage: `${provider.vendor} failed: ${LoaderService.describe(error)}` };
    }
  }

  private writeInTransaction(requirement: Requirement, tables: TableToRows): Promise<number> {
    const write = (): Promise<number> => this.writeNow(requirement, tables);
    // Why: DuckDB has one writer connection, so writes run one at a time, and each run is one transaction.
    const queued = this.writeQueue.then(write, write);
    this.writeQueue = queued.then(() => undefined, () => undefined);
    return queued;
  }

  private async writeNow(requirement: Requirement, tables: TableToRows): Promise<number> {
    const { writer } = this.store;
    const tableToColumns = await this.readColumns();
    for (const table of Object.keys(tables)) {
      if (!LoaderService.isWritable(table) || !Object.hasOwn(tableToColumns, table)) {
        throw new Error(`the provider wrote to ${table}, which is not a data table`);
      }
    }
    await writer.run("BEGIN TRANSACTION");
    try {
      let written = 0;
      for (const [table, rows] of Object.entries(tables)) {
        const columns = tableToColumns[table] ?? [];
        written += await this.replaceTable(requirement, table, rows, columns);
      }
      await writer.run("COMMIT");
      return written;
    } catch (error) {
      await writer.run("ROLLBACK");
      throw error;
    }
  }

  private async replaceTable(
    requirement: Requirement,
    table: string,
    rows: ProviderRow[],
    columns: readonly string[],
  ): Promise<number> {
    const { writer } = this.store;
    const isSeries = table === MACRO_TABLE;
    const keyColumns = isSeries ? SERIES_KEY_COLUMNS : ASSET_KEY_COLUMNS;
    const keyValues = isSeries ? [requirement.ticker] : [requirement.market, requirement.ticker];
    const deleteWhere = keyColumns.map((column) => `${column} = ?`).join(" AND ");
    await writer.run(`DELETE FROM ${table} WHERE ${deleteWhere}`, keyValues);
    for (const row of rows) {
      LoaderService.checkRow(requirement, table, row, columns);
      const names = Object.keys(row);
      const placeholders = names.map(() => "?").join(", ");
      const values = names.map((name) => row[name] ?? null);
      await writer.run(`INSERT INTO ${table} (${names.join(", ")}) VALUES (${placeholders})`, values);
    }
    return rows.length;
  }

  private static checkRow(requirement: Requirement, table: string, row: ProviderRow, columns: readonly string[]): void {
    const unknownColumn = Object.keys(row).find((name) => !columns.includes(name));
    if (unknownColumn !== undefined) {
      throw new Error(`the provider sent the column ${unknownColumn}, which ${table} does not have`);
    }
    const isOtherAsset = table === MACRO_TABLE
      ? row.series !== requirement.ticker
      : row.market !== requirement.market || row.ticker !== requirement.ticker;
    if (isOtherAsset) {
      throw new Error(`the provider sent a row for another asset in ${table}`);
    }
  }

  private static isWritable(table: string): boolean {
    return LoaderService.WRITABLE_TABLES.has(table);
  }

  private async readColumns(): Promise<TableToColumns> {
    const rows = await this.store.writer.readRows(
      "SELECT table_name AS tableName, column_name AS columnName FROM information_schema.columns WHERE table_schema = 'main'",
    );
    const tableToColumns: TableToColumns = {};
    for (const row of rows) {
      const table = String(row.tableName);
      tableToColumns[table] = [...(tableToColumns[table] ?? []), String(row.columnName)];
    }
    return tableToColumns;
  }

  private async readPeriod(requirement: Requirement): Promise<{
    from: string; to: string;
  } | undefined> {
    const rows = await this.store.writer.readRows(
      "SELECT CAST(first_date AS VARCHAR) AS firstDate, CAST(last_date AS VARCHAR) AS lastDate FROM asset_coverage WHERE category = ? AND market = ? AND ticker = ?",
      [requirement.category, requirement.market, requirement.ticker],
    );
    const [period] = PeriodRowsSchema.parse(rows);
    const firstDate = period?.firstDate;
    const lastDate = period?.lastDate;
    if (firstDate === null || firstDate === undefined || lastDate === null || lastDate === undefined) {
      return undefined;
    }
    return { from: firstDate, to: lastDate };
  }

  private static describe(error: unknown): string {
    return error instanceof Error ? error.message : "unknown error";
  }
}
