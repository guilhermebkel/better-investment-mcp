import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDbAdapter } from "@/Adapters/DuckDb/DuckDbAdapter.ts";
import { DuckDbSchemaAdapter } from "@/Adapters/DuckDb/DuckDbSchemaAdapter.ts";
import type { DatabasePort } from "@/Protocols/DatabaseProtocol.ts";
import type { LegalIdLookup } from "@/Protocols/CvmProtocol.ts";
import { StoreUnavailableError } from "@/Errors/StoreUnavailableError.ts";
import type { Env } from "@/Protocols/EnvProtocol.ts";
import type { OpenOutcome, SchemaVersionRow, TableCountRow } from "@/Protocols/StoreProtocol.ts";
import { LegalIdRowsSchema, SchemaVersionRowsSchema, TableCountRowsSchema } from "@/Schemas/StoreSchema.ts";
import { CacheService } from "@/Services/CacheService.ts";
import { LogUtil } from "@/Utils/LogUtil.ts";

const MS_PER_SECOND = 1000;

export class StoreService {
  static readonly FILE_NAME = "investment-mcp-cache.duckdb";
  static readonly CACHE_DIR_VARIABLE = "INVESTMENT_MCP_CACHE_DIR";
  static readonly LOCK_PATTERN = /Could not set lock/;

  readonly databasePath: string;
  readonly writer: DatabasePort;
  readonly cache: CacheService;

  private constructor(databasePath: string, writer: DatabasePort, cache: CacheService) {
    this.databasePath = databasePath;
    this.writer = writer;
    this.cache = cache;
  }

  static async open(env: Env, nowMs: () => number = () => Date.now()): Promise<StoreService> {
    const cacheDir = env.INVESTMENT_MCP_CACHE_DIR ?? tmpdir();
    await StoreService.ensureDirectory(cacheDir);
    const databasePath = join(cacheDir, StoreService.FILE_NAME);
    const writer = await StoreService.openUsableWriter(databasePath);
    const cache = new CacheService(writer, nowMs, env.INVESTMENT_MCP_CACHE_TTL_SECONDS * MS_PER_SECOND);
    return new StoreService(databasePath, writer, cache);
  }

  openReader(): Promise<DuckDbAdapter> {
    return DuckDbAdapter.openReader(this.databasePath);
  }

  static buildLegalIdLookup(database: DatabasePort): LegalIdLookup {
    return async (market: string, ticker: string): Promise<string | undefined> => {
      const rows = await database.readRows(
        "SELECT legal_id FROM assets WHERE market = ? AND ticker = ?",
        [market, ticker],
      );
      const parsed = LegalIdRowsSchema.safeParse(rows);
      if (!parsed.success) {
        return undefined;
      }
      const legalId = parsed.data[0]?.legal_id;
      if (typeof legalId === "string" && legalId.trim() !== "") {
        return legalId.trim();
      }
      return undefined;
    };
  }

  close(): void {
    this.writer.close();
  }

  private static async ensureDirectory(cacheDir: string): Promise<void> {
    try {
      await mkdir(cacheDir, { recursive: true });
    } catch (error) {
      throw new StoreUnavailableError(`${StoreService.CACHE_DIR_VARIABLE} is ${cacheDir}, which cannot be created: ${StoreService.describe(error)}`);
    }
  }

  private static async openUsableWriter(databasePath: string): Promise<DatabasePort> {
    const outcome = await StoreService.checkFile(databasePath, existsSync(databasePath));
    if (outcome.kind === "usable") {
      return outcome.writer;
    }
    return StoreService.replaceFile(databasePath, outcome.reason);
  }

  private static async checkFile(databasePath: string, isExisting: boolean): Promise<OpenOutcome> {
    let writer: DatabasePort;
    try {
      writer = await DuckDbAdapter.openWriter(databasePath);
    } catch (error) {
      return StoreService.onOpenFailure(databasePath, isExisting, StoreService.describe(error));
    }
    try {
      return await StoreService.checkSchema(writer, isExisting);
    } catch {
      writer.close();
      return { kind: "replace", reason: "it cannot be read" };
    }
  }

  private static onOpenFailure(databasePath: string, isExisting: boolean, message: string): OpenOutcome {
    if (!isExisting) {
      throw new StoreUnavailableError(`${StoreService.CACHE_DIR_VARIABLE} directory cannot hold the cache file ${databasePath}: ${message}`);
    }
    if (StoreService.LOCK_PATTERN.test(message)) {
      throw new StoreUnavailableError(`the cache file ${databasePath} is in use by another process; stop it or set ${StoreService.CACHE_DIR_VARIABLE}`);
    }
    return { kind: "replace", reason: "it cannot be opened" };
  }

  private static async checkSchema(writer: DatabasePort, isExisting: boolean): Promise<OpenOutcome> {
    const isSchemaPresent = await StoreService.hasSchemaTable(writer);
    if (!isSchemaPresent) {
      if (isExisting) {
        writer.close();
        return { kind: "replace", reason: "it has no schema version" };
      }
      await DuckDbSchemaAdapter.createSchema(writer);
      return { kind: "usable", writer };
    }
    const version = await StoreService.readVersion(writer);
    if (version !== DuckDbSchemaAdapter.VERSION) {
      writer.close();
      return { kind: "replace", reason: `it has schema version ${version}, not ${DuckDbSchemaAdapter.VERSION}` };
    }
    return { kind: "usable", writer };
  }

  private static async hasSchemaTable(writer: DatabasePort): Promise<boolean> {
    const rows = await writer.readRows("SELECT CAST(count(*) AS INTEGER) AS tableCount FROM information_schema.tables WHERE table_name = 'schema_version'");
    const [row]: TableCountRow[] = TableCountRowsSchema.parse(rows);
    return (row?.tableCount ?? 0) > 0;
  }

  private static async readVersion(writer: DatabasePort): Promise<number> {
    const rows = await writer.readRows("SELECT version FROM schema_version");
    const [row]: SchemaVersionRow[] = SchemaVersionRowsSchema.parse(rows);
    return row?.version ?? 0;
  }

  private static async replaceFile(databasePath: string, reason: string): Promise<DatabasePort> {
    // Why: the cache is disposable (ADR 0004), so a file that cannot be used is replaced rather than repaired.
    LogUtil.logInfo("store_replaced", { reason, databasePath });
    await rm(databasePath, { force: true });
    await rm(`${databasePath}.wal`, { force: true });
    const writer = await DuckDbAdapter.openWriter(databasePath);
    await DuckDbSchemaAdapter.createSchema(writer);
    return writer;
  }

  private static describe(error: unknown): string {
    return error instanceof Error ? error.message : "unknown error";
  }
}
