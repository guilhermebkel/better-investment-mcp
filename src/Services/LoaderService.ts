import { createHash } from "node:crypto";
import type { CacheCategory, CacheLoadResult } from "@/Protocols/CacheProtocol.ts";
import type { DatabasePort } from "@/Protocols/DatabaseProtocol.ts";
import type { DocumentProvider } from "@/Protocols/DocumentProviderProtocol.ts";
import type { ChunkRow } from "@/Protocols/DocumentTextProtocol.ts";
import type { DataTable, Requirement } from "@/Protocols/SqlGuardProtocol.ts";
import type {
  DownloadOutcome,
  FetchAttempt,
  FetchOutcome,
  FilingRow,
  LoadedEntry,
  LoaderPort,
  ScopeRule,
  SqlScope,
  TableReplaceOutcome,
  TableToColumns,
  WriteOutcome,
} from "@/Protocols/LoaderProtocol.ts";
import type { PeriodWindow } from "@/Protocols/PeriodProtocol.ts";
import type { ProviderPort, ProviderRequest, ProviderRow, ProviderResult, ResolvedProviders } from "@/Protocols/ProviderProtocol.ts";
import { PeriodRowsSchema } from "@/Schemas/CacheSchema.ts";
import { ProviderResultSchema } from "@/Schemas/ProviderSchema.ts";
import { ChunkService } from "@/Services/ChunkService.ts";
import { CvmFailureError } from "@/Errors/CvmFailureError.ts";
import { FileVersionService } from "@/Services/FileVersionService.ts";
import { DocumentTextService } from "@/Services/DocumentTextService.ts";
import { FullTextIndexService } from "@/Services/FullTextIndexService.ts";
import { PeriodService } from "@/Services/PeriodService.ts";
import { AssetIdUtil } from "@/Utils/AssetIdUtil.ts";
import type { ProviderRegistryService } from "@/Services/ProviderRegistryService.ts";
import { SqlGuardService } from "@/Services/SqlGuardService.ts";
import type { StoreService } from "@/Services/StoreService.ts";
import { ConcurrencyUtil } from "@/Utils/ConcurrencyUtil.ts";

const ASSET_TABLE = "asset";
const DISCLOSURE_DOCUMENT_TYPES = ["fre", "vlmo", "cgvn"] as const;
const DOCUMENT_SOURCE = "cvm";
const MS_PER_MINUTE = 60_000;
const FAILURE_WINDOW_MINUTES = 60;

export class LoaderService implements LoaderPort {
  static readonly MAX_PARALLEL_LOADS = 4;
  // Why: a source that keeps failing (StatusInvest answers 403 to this server) is not asked again on every query; after this many failures in the window the load is refused until the window has passed.
  static readonly MAX_FAILED_ATTEMPTS = 3;
  static readonly FAILURE_WINDOW_MS = FAILURE_WINDOW_MINUTES * MS_PER_MINUTE;
  static readonly INSERT_BATCH_ROWS = 500;
  static readonly WRITABLE_TABLES: ReadonlySet<string> = new Set(Object.keys(SqlGuardService.TABLE_TO_FILTERS));

  private readonly store: StoreService;
  private readonly registry: ProviderRegistryService;
  private readonly rebuildIndex: (writer: DatabasePort) => Promise<void>;
  private readonly clock: () => Date;
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(
    store: StoreService,
    registry: ProviderRegistryService,
    rebuildIndex: (writer: DatabasePort) => Promise<void> = (writer) => FullTextIndexService.buildIndex(writer),
    clock: () => Date = () => new Date(),
  ) {
    this.store = store;
    this.registry = registry;
    // Why: the index build is a parameter so unit tests run without the full-text extension; the default installs it.
    this.rebuildIndex = rebuildIndex;
    // Why: the clock is a parameter, so the default period and the expiry of a load are the same in every test that sets it.
    this.clock = clock;
  }

  async ensure(requirements: readonly Requirement[]): Promise<LoadedEntry[]> {
    const documentRequirements = requirements.filter((requirement) => requirement.category === "documents");
    const otherRequirements = requirements.filter((requirement) => requirement.category !== "documents");
    const ensureOne = (requirement: Requirement): Promise<LoadedEntry> => this.ensureOne(requirement);
    const ensureDocuments = (requirement: Requirement): Promise<LoadedEntry[]> => this.ensureDocuments(requirement);
    const limit = LoaderService.MAX_PARALLEL_LOADS;
    const direct = await ConcurrencyUtil.mapWithLimit(LoaderService.dedupe(otherRequirements), limit, ensureOne);
    const documentUnique = LoaderService.dedupe(documentRequirements);
    const documents = await ConcurrencyUtil.mapWithLimit(documentUnique, limit, ensureDocuments);
    return [...direct, ...documents.flat()];
  }

  private static dedupe(requirements: readonly Requirement[]): Requirement[] {
    const buildKey = (requirement: Requirement): string => {
      const parts = [requirement.category, requirement.market, requirement.ticker, requirement.assetType ?? "", requirement.filingId ?? "", requirement.filingType ?? "", JSON.stringify(requirement.period ?? {})];
      return parts.join("|");
    };
    return [...new Map(requirements.map((requirement) => [buildKey(requirement), requirement])).values()];
  }

  private readFailureWindowStart(): Date {
    return new Date(this.clock().getTime() - LoaderService.FAILURE_WINDOW_MS);
  }

  private static buildItemErrors(result: CacheLoadResult): { itemErrors?: string[] } {
    return result.itemErrors === undefined || result.itemErrors.length === 0 ? {} : { itemErrors: result.itemErrors };
  }

  private static buildRetryError(failures: number): string {
    const minutes = LoaderService.FAILURE_WINDOW_MS / MS_PER_MINUTE;
    return `the load failed ${failures} times in the last ${minutes} minutes; it is not tried again until then`;
  }

  private async ensureOne(requirement: Requirement): Promise<LoadedEntry> {
    const { cache } = this.store;
    const window = this.resolveWindow(requirement);
    const base = {
      category: requirement.category,
      market: requirement.market,
      ticker: requirement.ticker,
      isFallback: false,
      rowsWritten: 0,
      ...(window === undefined ? {} : { requestedPeriod: window }),
      ...LoaderService.readPeriodicity(requirement),
    };
    if (window !== undefined && PeriodService.isEmpty(window)) {
      return { ...base, status: "failed", error: `the period ${window.from} to ${window.to} is empty` };
    }
    if (window !== undefined && PeriodService.readYears(window).length > PeriodService.MAX_YEARS_PER_LOAD) {
      const error = `the period ${window.from} to ${window.to} is longer than ${PeriodService.MAX_YEARS_PER_LOAD} years; narrow it to load it`;
      return { ...base, status: "failed", error };
    }
    if (await cache.isFresh(requirement.category, LoaderService.buildAssetId(requirement), window)) {
      const source = await cache.readLastSource(requirement.category, LoaderService.buildAssetId(requirement));
      const period = await this.readPeriod(requirement);
      return { ...base, status: "fresh", ...(source === undefined ? {} : { source }), ...(period === undefined ? {} : { period }) };
    }
    const { category } = requirement;
    const assetId = LoaderService.buildAssetId(requirement);
    const failures = await cache.countRecentFailures(category, assetId, this.readFailureWindowStart());
    if (failures >= LoaderService.MAX_FAILED_ATTEMPTS) {
      return { ...base, status: "failed", error: LoaderService.buildRetryError(failures) };
    }
    const windowKey = window === undefined ? "" : `:${window.from}:${window.to}`;
    const result = await cache.runOnce(`${category}:${LoaderService.buildAssetId(requirement)}${windowKey}`, () => this.load(requirement, window));
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
      ...LoaderService.buildItemErrors(result),
    };
  }

  private resolveWindow(requirement: Requirement): PeriodWindow | undefined {
    if (PeriodService.TABLE_TO_PERIOD_COLUMN[requirement.table] === undefined) {
      return undefined;
    }
    return PeriodService.resolve(requirement.period, this.clock().getUTCFullYear());
  }

  private static readPeriodicity(requirement: Requirement): { periodicity?: string } {
    const periodicity = PeriodService.CATEGORY_TO_PERIODICITY[requirement.category]
      ?? PeriodService.TABLE_TO_PERIODICITY[requirement.table];
    return periodicity === undefined ? {} : { periodicity };
  }

  private async load(requirement: Requirement, window: PeriodWindow | undefined): Promise<CacheLoadResult> {
    let resolved: ResolvedProviders;
    try {
      // Why: the provider is called before anything is written, so a failed call leaves the rows of the previous load in place.
      resolved = this.registry.resolve(requirement.category, requirement.market, requirement.assetType);
    } catch (error) {
      return { rowsWritten: 0, isFallback: false, errorMessage: LoaderService.describe(error) };
    }
    const fetched = await this.fetchWithFallback(resolved, requirement, window);
    const runId = await this.store.cache.startRun({
      category: requirement.category,
      assetId: LoaderService.buildAssetId(requirement),
      source: fetched.vendor,
      ...(window === undefined ? {} : { period: window }),
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
      const outcome = await this.writeInTransaction(requirement, fetched.result, window);
      await this.store.cache.finishRun(runId, { rowsRead: outcome.rowsWritten });
      const itemErrors = [...(fetched.result.itemErrors ?? []), ...outcome.itemErrors];
      return {
        rowsWritten: outcome.rowsWritten,
        source: fetched.vendor,
        isFallback: fetched.isFallback,
        ...(itemErrors.length === 0 ? {} : { itemErrors }),
      };
    } catch (error) {
      const errorMessage = LoaderService.describe(error);
      await this.store.cache.finishRun(runId, { rowsRead: 0, errorMessage });
      return { rowsWritten: 0, source: fetched.vendor, isFallback: fetched.isFallback, errorMessage };
    }
  }

  private async ensureDocuments(requirement: Requirement): Promise<LoadedEntry[]> {
    const { market, ticker } = requirement;
    const base = { market, ticker, category: "documents" as const, isFallback: false, rowsWritten: 0 };
    // Why: a document is loaded per filing; the filing list comes first, so the chunks name filings the store knows.
    if (requirement.assetType === undefined) {
      return [{ ...base, status: "failed", error: "documents need the asset type of the asset" }];
    }
    const filingsEntry = await this.ensureOne({
      market,
      ticker,
      table: "asset_filings",
      category: "filings",
      assetType: requirement.assetType,
    });
    if (filingsEntry.status === "failed") {
      return [{ ...base, status: "failed", error: `the filing list could not be loaded: ${filingsEntry.error ?? "unknown error"}` }];
    }
    const filings = await this.readFilings(requirement);
    if (filings.length === 0) {
      const selector = requirement.filingId === undefined ? `filing type ${requirement.filingType ?? ""}` : `filing id ${requirement.filingId}`;
      return [{ ...base, status: "failed", error: `no filing of ${market}:${ticker} matches ${selector}` }];
    }
    return Promise.all(filings.map((filing) => this.ensureFiling(filing)));
  }

  private async ensureFiling(filing: FilingRow): Promise<LoadedEntry> {
    const base = {
      category: "documents" as const,
      market: filing.market,
      ticker: filing.ticker,
      filingId: filing.filing_id,
      isFallback: false,
      source: DOCUMENT_SOURCE,
    };
    if (await this.store.cache.isFreshFiling(filing.filing_id)) {
      return { ...base, status: "fresh", rowsWritten: 0 };
    }
    const failures = await this.store.cache.countRecentFilingFailures(filing.filing_id, this.readFailureWindowStart());
    if (failures >= LoaderService.MAX_FAILED_ATTEMPTS) {
      return { ...base, status: "failed", rowsWritten: 0, error: LoaderService.buildRetryError(failures) };
    }
    const result = await this.store.cache.runOnce(`documents:${filing.filing_id}`, () => this.loadDocument(filing));
    return {
      ...base,
      status: result.errorMessage === undefined ? "loaded" : "failed",
      rowsWritten: result.rowsWritten,
      ...(result.pagesWithoutText === undefined ? {} : { pagesWithoutText: result.pagesWithoutText }),
      ...(result.indexError === undefined ? {} : { indexError: result.indexError }),
      // Why: a failed document names its filing, so the agent can tell which one could not be read; the other filings of the query still load (issue #27).
      ...(result.errorMessage === undefined ? {} : { error: `${filing.filing_type} filing ${filing.filing_id}: ${result.errorMessage}` }),
    };
  }

  private async loadDocument(filing: FilingRow): Promise<CacheLoadResult> {
    const { cache } = this.store;
    const download = await LoaderService.fetchAndSplit(this.registry, filing);
    const runId = await cache.startRun({
      category: "filings",
      assetId: AssetIdUtil.build({ market: filing.market, assetType: filing.asset_type, code: filing.ticker }),
      source: DOCUMENT_SOURCE,
      filingId: filing.filing_id,
    });
    if (download.errorMessage !== undefined) {
      await cache.finishRun(runId, { rowsRead: 0, errorMessage: download.errorMessage });
      return { rowsWritten: 0, source: DOCUMENT_SOURCE, isFallback: false, errorMessage: download.errorMessage };
    }
    try {
      const written = await this.writeDocument(filing, download.hash, download.chunks);
      const indexError = written.isChanged ? await this.enqueue(() => this.buildIndexOrReport()) : undefined;
      await cache.finishRun(runId, { rowsRead: download.chunks.length });
      return {
        rowsWritten: written.isChanged ? download.chunks.length : 0,
        source: DOCUMENT_SOURCE,
        isFallback: false,
        pagesWithoutText: download.pagesWithoutText,
        ...(indexError === undefined ? {} : { indexError }),
      };
    } catch (error) {
      const errorMessage = LoaderService.describe(error);
      await cache.finishRun(runId, { rowsRead: 0, errorMessage });
      return { rowsWritten: 0, source: DOCUMENT_SOURCE, isFallback: false, errorMessage };
    }
  }

  private static async fetchAndSplit(registry: ProviderRegistryService, filing: FilingRow): Promise<DownloadOutcome> {
    try {
      if (filing.url === null || filing.url === "") {
        throw new Error(`the CVM file gives no link for this ${filing.filing_type} filing, so its document cannot be read`);
      }
      const provider: DocumentProvider = registry.resolveDocument(filing.market, filing.asset_type);
      // Why: nothing is written before the download, the size check and the extraction have all succeeded, so a refused document leaves the store as it was.
      const bytes = await provider.fetchDocument(filing.url);
      const hash = createHash("sha256").update(bytes).digest("hex");
      const extracted = await DocumentTextService.extract(bytes);
      return { hash, chunks: ChunkService.split(extracted.segments), pagesWithoutText: extracted.pagesWithoutText };
    } catch (error) {
      return { hash: "", chunks: [], pagesWithoutText: 0, errorMessage: LoaderService.describe(error) };
    }
  }

  private writeDocument(filing: FilingRow, hash: string, chunks: readonly ChunkRow[]): Promise<{ isChanged: boolean }> {
    return this.enqueue(() => this.writeDocumentNow(filing, hash, chunks));
  }

  private enqueue<Result>(work: () => Promise<Result>): Promise<Result> {
    // Why: the writes and the index builds share one writer queue, so no two of them run on the one writer connection at the same time.
    const queued = this.writeQueue.then(work, work);
    this.writeQueue = queued.then(() => undefined, () => undefined);
    return queued;
  }

  private async writeDocumentNow(
    filing: FilingRow,
    hash: string,
    chunks: readonly ChunkRow[],
  ): Promise<{ isChanged: boolean }> {
    const { writer } = this.store;
    const rows = await writer.readRows(
      "SELECT file_hash AS fileHash FROM asset_filings WHERE filing_id = ?",
      [filing.filing_id],
    );
    const storedHash = rows[0]?.fileHash;
    // Why: the hash and the chunks are written in one transaction, so an unchanged hash means the stored chunks are the document's.
    if (storedHash === hash) {
      return { isChanged: false };
    }
    await writer.run("BEGIN TRANSACTION");
    try {
      await writer.run("DELETE FROM asset_filing_chunks WHERE filing_id = ?", [filing.filing_id]);
      const assetId = AssetIdUtil.build({ market: filing.market, assetType: filing.asset_type, code: filing.ticker });
      for (const chunk of chunks) {
        const values = [
          filing.filing_id, assetId, filing.filing_type,
          chunk.section, chunk.page, chunk.seq, chunk.text,
        ];
        await writer.run(
          "INSERT INTO asset_filing_chunks (filing_id, asset_id, document_type, section, page, seq, text) VALUES (?, ?, ?, ?, ?, ?, ?)",
          values,
        );
      }
      await writer.run("UPDATE asset_filings SET file_hash = ? WHERE filing_id = ?", [hash, filing.filing_id]);
      await writer.run("COMMIT");
      return { isChanged: true };
    } catch (error) {
      await writer.run("ROLLBACK");
      throw error;
    }
  }

  private async buildIndexOrReport(): Promise<string | undefined> {
    try {
      await this.rebuildIndex(this.store.writer);
      return undefined;
    } catch (error) {
      // Why: the chunks are stored even when the index cannot be built; the answer then says why search_chunks failed.
      return LoaderService.describe(error);
    }
  }

  private async readFilings(requirement: Requirement): Promise<FilingRow[]> {
    const selector = requirement.filingId === undefined ? "document_type = ?" : "filing_id = ?";
    const value = requirement.filingId ?? requirement.filingType ?? "";
    const rows = await this.store.writer.readRows(
      `SELECT filing_id, document_type, url, file_hash FROM asset_filings WHERE asset_id = ? AND ${selector} ORDER BY published_at`,
      [LoaderService.buildAssetId(requirement), value],
    );
    return rows.map((row) => ({
      filing_id: String(row.filing_id),
      market: requirement.market,
      ticker: requirement.ticker,
      asset_type: requirement.assetType ?? "",
      filing_type: String(row.document_type),
      url: typeof row.url === "string" ? row.url : null,
      file_hash: typeof row.file_hash === "string" ? row.file_hash : null,
    }));
  }

  private async fetchWithFallback(
    resolved: ResolvedProviders,
    requirement: Requirement,
    window: PeriodWindow | undefined,
  ): Promise<FetchOutcome> {
    const request: ProviderRequest = {
      market: requirement.market,
      ticker: requirement.ticker,
      assetType: requirement.assetType,
      ...(window === undefined ? {} : { period: window }),
    };
    const primaryAttempt = await LoaderService.fetchOnce(resolved.primary, request);
    const fallback = resolved.fallback;
    // Why: a CVM failure is reported as it is and never replaced by another source (issue #28, P3, AC7); only a failure of another vendor may fall back.
    const isFallbackAllowed = !primaryAttempt.isFallbackBlocked && fallback !== undefined;
    if (primaryAttempt.result !== undefined || !isFallbackAllowed) {
      return { ...primaryAttempt, vendor: resolved.primary.vendor, isFallback: false };
    }
    const fallbackAttempt = await LoaderService.fetchOnce(fallback, request);
    return { ...fallbackAttempt, vendor: fallback.vendor, isFallback: true };
  }

  private static async fetchOnce(provider: ProviderPort, request: ProviderRequest): Promise<FetchAttempt> {
    try {
      const result: ProviderResult = ProviderResultSchema.parse(await provider.fetchTables(request));
      return { result, errorMessage: undefined, isFallbackBlocked: false };
    } catch (error) {
      return {
        result: undefined,
        errorMessage: `${provider.vendor} failed: ${LoaderService.describe(error)}`,
        isFallbackBlocked: error instanceof CvmFailureError,
      };
    }
  }

  private writeInTransaction(
    requirement: Requirement,
    result: ProviderResult,
    window: PeriodWindow | undefined,
  ): Promise<WriteOutcome> {
    // Why: DuckDB has one writer connection, so writes run one at a time, and each run is one transaction.
    return this.enqueue(() => this.writeNow(requirement, result, window));
  }

  private async writeNow(
    requirement: Requirement,
    result: ProviderResult,
    window: PeriodWindow | undefined,
  ): Promise<WriteOutcome> {
    const { writer } = this.store;
    const tableToColumns = await this.readColumns();
    for (const table of Object.keys(result.tables)) {
      if (!LoaderService.isWritable(table) || !Object.hasOwn(tableToColumns, table)) {
        throw new Error(`the provider wrote to ${table}, which is not a data table`);
      }
    }
    await writer.run("BEGIN TRANSACTION");
    try {
      let rowsWritten = 0;
      const itemErrors: string[] = [];
      for (const [table, rows] of Object.entries(result.tables)) {
        const columns = tableToColumns[table] ?? [];
        const replaced = await this.replaceTable(requirement, table, rows, columns, window);
        rowsWritten += replaced.written;
        // Why: a period load skips a row outside its window; the rows inside it are stored and the skipped ones are named.
        if (replaced.outsidePeriod > 0 && window !== undefined) {
          itemErrors.push(`${table}: ${replaced.outsidePeriod} row(s) outside the requested period ${window.from} to ${window.to} were not stored`);
        }
      }
      await FileVersionService.record(writer, result.files ?? [], this.clock().toISOString());
      await writer.run("COMMIT");
      return { rowsWritten, itemErrors };
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
    window: PeriodWindow | undefined,
  ): Promise<TableReplaceOutcome> {
    const { writer } = this.store;
    const assetId = LoaderService.buildAssetId(requirement);
    const periodColumn = window === undefined ? undefined : PeriodService.TABLE_TO_PERIOD_COLUMN[table as DataTable];
    // Why: a period load replaces only the rows of its own window, so the rows of another period stay in the store.
    const periodWhere = periodColumn === undefined ? "" : ` AND ${periodColumn} BETWEEN ? AND ?`;
    // Why: the values are bound only when the WHERE clause has their placeholders; a table with no period column (asset_splits) has none.
    const periodValues = periodWhere === "" || window === undefined ? [] : [window.from, window.to];
    // Why: a filing list reload keeps the hash of each document already stored, so an unchanged document is not downloaded again into the chunks.
    const filingIdToHash = await this.readStoredHashes(table, requirement);
    // Why: the asset row is merged, not replaced: each load fills the columns it knows and keeps the others, so a CVM load does not erase a name that Yahoo gave.
    if (table !== ASSET_TABLE) {
      const scope = LoaderService.readScope(table, requirement.category);
      await writer.run(`DELETE FROM ${table} WHERE asset_id = ?${scope.sql}${periodWhere}`, [assetId, ...scope.values, ...periodValues]);
    }
    const prepared: ProviderRow[] = [];
    let outsidePeriod = 0;
    for (const original of rows) {
      const row = LoaderService.dropSource(original);
      LoaderService.checkRow(requirement, table, row, columns);
      if (!LoaderService.isInPeriod(table, row, window)) {
        outsidePeriod += 1;
        continue;
      }
      prepared.push(LoaderService.keepStoredHash(row, filingIdToHash));
    }
    if (table === ASSET_TABLE) {
      await LoaderService.mergeAssets(writer, prepared);
      return { written: prepared.length, outsidePeriod };
    }
    // Why: the rows go in batches of many value groups per statement; one statement per row made a full history of a series take minutes. A column a row does not carry is written as NULL, as before.
    const names = [...new Set(prepared.flatMap((row) => Object.keys(row)))];
    for (let start = 0; start < prepared.length; start += LoaderService.INSERT_BATCH_ROWS) {
      const batch = prepared.slice(start, start + LoaderService.INSERT_BATCH_ROWS);
      const placeholders = batch.map(() => `(${names.map(() => "?").join(", ")})`).join(", ");
      const values = batch.flatMap((row) => names.map((name) => row[name] ?? null));
      await writer.run(`INSERT INTO ${table} (${names.join(", ")}) VALUES ${placeholders}`, values);
    }
    return { written: prepared.length, outsidePeriod };
  }

  private async readStoredHashes(table: string, requirement: Requirement): Promise<Map<string, string>> {
    if (table !== "asset_filings") {
      return new Map();
    }
    const rows = await this.store.writer.readRows(
      "SELECT filing_id, file_hash FROM asset_filings WHERE asset_id = ? AND file_hash IS NOT NULL",
      [LoaderService.buildAssetId(requirement)],
    );
    return new Map(rows.map((row): [string, string] => [String(row.filing_id), String(row.file_hash)]));
  }

  private static keepStoredHash(row: ProviderRow, filingIdToHash: ReadonlyMap<string, string>): ProviderRow {
    const filingId = row.filing_id;
    if (typeof filingId !== "string" || (row.file_hash !== undefined && row.file_hash !== null)) {
      return row;
    }
    const storedHash = filingIdToHash.get(filingId);
    return storedHash === undefined ? row : { ...row, file_hash: storedHash };
  }

  private static isInPeriod(table: string, row: ProviderRow, window: PeriodWindow | undefined): boolean {
    const periodColumn = PeriodService.TABLE_TO_PERIOD_COLUMN[table as DataTable];
    if (window === undefined || periodColumn === undefined) {
      return true;
    }
    const date = row[periodColumn];
    if (typeof date !== "string") {
      throw new Error(`the provider sent a row of ${table} without a ${periodColumn}`);
    }
    return PeriodService.isWithin(window, date);
  }

  private static checkRow(requirement: Requirement, table: string, row: ProviderRow, columns: readonly string[]): void {
    const unknownColumn = Object.keys(row).find((name) => !columns.includes(name));
    if (unknownColumn !== undefined) {
      throw new Error(`the provider sent the column ${unknownColumn}, which ${table} does not have`);
    }
    if (row.asset_id !== LoaderService.buildAssetId(requirement)) {
      throw new Error(`the provider sent a row for another asset in ${table}`);
    }
  }

  private static dropSource(row: ProviderRow): ProviderRow {
    // Why: a row does not carry the vendor that produced it; the load records its source once, in load_runs, and every row of a key comes from that one load.
    const { source: _source, ...withoutSource } = row;
    return withoutSource;
  }

  private static readScope(table: string, category: CacheCategory): SqlScope {
    const scope = SqlGuardService.isDataTable(table) ? LoaderService.TABLE_TO_SCOPE[table] : undefined;
    return scope === undefined ? { sql: "", values: [] } : scope(category);
  }

  private static readFilingScope(category: CacheCategory): SqlScope {
    const types = [...DISCLOSURE_DOCUMENT_TYPES];
    const placeholders = types.map(() => "?").join(", ");
    const operator = LoaderService.CATEGORY_TO_FILING_OPERATOR[category] ?? "NOT IN";
    return { sql: ` AND document_type ${operator} (${placeholders})`, values: types };
  }

  // Why: a metric scope is the group of the category; a filing scope keeps the disclosure types on their own category, and the other filings on the rest.
  private static readonly TABLE_TO_SCOPE: Readonly<Partial<Record<DataTable, ScopeRule>>> = {
    asset_metrics: (category) => {
      const group = LoaderService.readMetricGroup(category);
      return group === undefined ? { sql: "", values: [] } : { sql: " AND metric LIKE ?", values: [`${group}.%`] };
    },
    asset_filings: (category) => LoaderService.readFilingScope(category),
  };

  private static readonly CATEGORY_TO_FILING_OPERATOR: Partial<Record<CacheCategory, "IN" | "NOT IN">> = { disclosures: "IN" };

  private static readMetricGroup(category: CacheCategory): string | undefined {
    return Object.entries(SqlGuardService.METRIC_GROUP_TO_CATEGORY).find(([, owner]) => owner === category)?.[0];
  }

  private static buildAssetId(requirement: Requirement): string {
    return AssetIdUtil.build({
      market: requirement.market,
      assetType: requirement.assetType ?? "",
      code: requirement.ticker,
    });
  }

  private static async mergeAssets(writer: DatabasePort, rows: readonly ProviderRow[]): Promise<void> {
    // Why: each column of the asset row that a load fills replaces the stored one; a column it leaves null keeps the value another load gave.
    for (const row of rows) {
      const names = Object.keys(row);
      const updates = names.filter((name) => name !== "asset_id").map((name) => `${name} = COALESCE(excluded.${name}, asset.${name})`);
      const placeholders = names.map(() => "?").join(", ");
      const values = names.map((name) => row[name] ?? null);
      const conflict = updates.length === 0 ? "DO NOTHING" : `DO UPDATE SET ${updates.join(", ")}`;
      await writer.run(`INSERT INTO asset (${names.join(", ")}) VALUES (${placeholders}) ON CONFLICT (asset_id) ${conflict}`, values);
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
      "SELECT CAST(first_date AS VARCHAR) AS firstDate, CAST(last_date AS VARCHAR) AS lastDate FROM asset_coverage WHERE category = ? AND asset_id = ?",
      [requirement.category, LoaderService.buildAssetId(requirement)],
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
