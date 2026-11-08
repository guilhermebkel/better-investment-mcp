import { createHash } from "node:crypto";
import type { CacheLoadResult } from "@/Protocols/CacheProtocol.ts";
import type { DatabasePort } from "@/Protocols/DatabaseProtocol.ts";
import type { DocumentProvider } from "@/Protocols/DocumentProviderProtocol.ts";
import type { ChunkRow } from "@/Protocols/DocumentTextProtocol.ts";
import type { Requirement } from "@/Protocols/SqlGuardProtocol.ts";
import type { DownloadOutcome, FetchAttempt, FetchOutcome, FilingRow, LoadedEntry, LoaderPort, TableToColumns } from "@/Protocols/LoaderProtocol.ts";
import type { ProviderPort, ProviderRequest, ProviderRow, ProviderResult, ResolvedProviders, TableToRows } from "@/Protocols/ProviderProtocol.ts";
import { PeriodRowsSchema } from "@/Schemas/CacheSchema.ts";
import { ProviderResultSchema } from "@/Schemas/ProviderSchema.ts";
import { ChunkService } from "@/Services/ChunkService.ts";
import { DocumentTextService } from "@/Services/DocumentTextService.ts";
import { FullTextIndexService } from "@/Services/FullTextIndexService.ts";
import type { ProviderRegistryService } from "@/Services/ProviderRegistryService.ts";
import { SqlGuardService } from "@/Services/SqlGuardService.ts";
import type { StoreService } from "@/Services/StoreService.ts";
import { ConcurrencyUtil } from "@/Utils/ConcurrencyUtil.ts";

const MACRO_TABLE = "macro_series";
const ASSET_KEY_COLUMNS: readonly ("market" | "ticker")[] = ["market", "ticker"];
const SERIES_KEY_COLUMNS: readonly "series"[] = ["series"];
const DOCUMENT_SOURCE = "cvm";

export class LoaderService implements LoaderPort {
  static readonly MAX_PARALLEL_LOADS = 4;
  static readonly WRITABLE_TABLES: ReadonlySet<string> = new Set([...Object.keys(SqlGuardService.TABLE_TO_CATEGORY), "assets"]);

  private readonly store: StoreService;
  private readonly registry: ProviderRegistryService;
  private readonly rebuildIndex: (writer: DatabasePort) => Promise<void>;
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(
    store: StoreService,
    registry: ProviderRegistryService,
    rebuildIndex: (writer: DatabasePort) => Promise<void> = (writer) => FullTextIndexService.buildIndex(writer),
  ) {
    this.store = store;
    this.registry = registry;
    // Why: the index build is a parameter so unit tests run without the full-text extension; the default installs it.
    this.rebuildIndex = rebuildIndex;
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
      const parts = [requirement.category, requirement.market, requirement.ticker, requirement.assetType ?? "", requirement.filingId ?? "", requirement.filingType ?? ""];
      return parts.join("|");
    };
    return [...new Map(requirements.map((requirement) => [buildKey(requirement), requirement])).values()];
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
    const result = await cache.runOnce(`${category}:${market}:${ticker}`, () => this.load(requirement));
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
      table: "filings",
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
    const result = await this.store.cache.runOnce(`documents:${filing.filing_id}`, () => this.loadDocument(filing));
    return {
      ...base,
      status: result.errorMessage === undefined ? "loaded" : "failed",
      rowsWritten: result.rowsWritten,
      ...(result.pagesWithoutText === undefined ? {} : { pagesWithoutText: result.pagesWithoutText }),
      ...(result.indexError === undefined ? {} : { indexError: result.indexError }),
      ...(result.errorMessage === undefined ? {} : { error: result.errorMessage }),
    };
  }

  private async loadDocument(filing: FilingRow): Promise<CacheLoadResult> {
    const { cache } = this.store;
    const download = await LoaderService.fetchAndSplit(this.registry, filing);
    const runId = await cache.startRun({
      category: "documents",
      market: filing.market,
      ticker: filing.ticker,
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
        throw new Error("the filing has no link to its document");
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
      "SELECT file_hash AS fileHash FROM filings WHERE filing_id = ?",
      [filing.filing_id],
    );
    const storedHash = rows[0]?.fileHash;
    // Why: the hash and the chunks are written in one transaction, so an unchanged hash means the stored chunks are the document's.
    if (storedHash === hash) {
      return { isChanged: false };
    }
    await writer.run("BEGIN TRANSACTION");
    try {
      await writer.run("DELETE FROM chunks WHERE filing_id = ?", [filing.filing_id]);
      for (const chunk of chunks) {
        const values = [
          filing.filing_id, filing.market, filing.ticker, filing.asset_type, filing.filing_type,
          chunk.section, chunk.page, chunk.seq, chunk.text,
        ];
        await writer.run(
          "INSERT INTO chunks (filing_id, market, ticker, asset_type, filing_type, section, page, seq, text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          values,
        );
      }
      await writer.run("UPDATE filings SET file_hash = ? WHERE filing_id = ?", [hash, filing.filing_id]);
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
    const selector = requirement.filingId === undefined ? "filing_type = ?" : "filing_id = ?";
    const value = requirement.filingId ?? requirement.filingType ?? "";
    const rows = await this.store.writer.readRows(
      `SELECT filing_id, market, ticker, asset_type, filing_type, url, file_hash FROM filings WHERE market = ? AND ticker = ? AND asset_type = ? AND ${selector} ORDER BY delivered_at`,
      [requirement.market, requirement.ticker, requirement.assetType ?? "", value],
    );
    return rows.map((row) => ({
      filing_id: String(row.filing_id),
      market: String(row.market),
      ticker: String(row.ticker),
      asset_type: String(row.asset_type),
      filing_type: String(row.filing_type),
      url: typeof row.url === "string" ? row.url : null,
      file_hash: typeof row.file_hash === "string" ? row.file_hash : null,
    }));
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
    // Why: DuckDB has one writer connection, so writes run one at a time, and each run is one transaction.
    return this.enqueue(() => this.writeNow(requirement, tables));
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
    // Why: a filing list reload keeps the hash of each document already stored, so an unchanged document is not downloaded again into the chunks.
    const filingIdToHash = await this.readStoredHashes(table, requirement);
    await writer.run(`DELETE FROM ${table} WHERE ${deleteWhere}`, keyValues);
    for (const original of rows) {
      LoaderService.checkRow(requirement, table, original, columns);
      const row = LoaderService.keepStoredHash(original, filingIdToHash);
      const names = Object.keys(row);
      const placeholders = names.map(() => "?").join(", ");
      const values = names.map((name) => row[name] ?? null);
      await writer.run(`INSERT INTO ${table} (${names.join(", ")}) VALUES (${placeholders})`, values);
    }
    return rows.length;
  }

  private async readStoredHashes(table: string, requirement: Requirement): Promise<Map<string, string>> {
    if (table !== "filings") {
      return new Map();
    }
    const rows = await this.store.writer.readRows(
      "SELECT filing_id, file_hash FROM filings WHERE market = ? AND ticker = ? AND file_hash IS NOT NULL",
      [requirement.market, requirement.ticker],
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
