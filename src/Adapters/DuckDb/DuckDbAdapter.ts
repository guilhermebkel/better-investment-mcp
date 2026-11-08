import { DuckDBInstance } from "@duckdb/node-api";
import type { DuckDBConnection } from "@duckdb/node-api";
import type { DatabasePort, DatabaseValue } from "@/Protocols/DatabaseProtocol.ts";

const FULL_TEXT_EXTENSION = "fts";

export class DuckDbAdapter implements DatabasePort {
  // Why: DuckDB downloads the full-text extension from this host the first time it is installed; it is the only host the store reaches (ADR 0013).
  static readonly EXTENSION_HOST = "extensions.duckdb.org";

  private readonly instance: DuckDBInstance;
  private readonly connection: DuckDBConnection;

  private constructor(instance: DuckDBInstance, connection: DuckDBConnection) {
    this.instance = instance;
    this.connection = connection;
  }

  static async openWriter(databasePath: string): Promise<DuckDbAdapter> {
    const instance = await DuckDBInstance.create(databasePath);
    return DuckDbAdapter.connect(instance);
  }

  static async openReader(databasePath: string): Promise<DuckDbAdapter> {
    // Why: external access stays on only so the full-text extension can be loaded (ADR 0013); the lock below is applied right after.
    const instance = await DuckDBInstance.create(databasePath, { access_mode: "READ_ONLY", enable_external_access: "true" });
    const adapter = await DuckDbAdapter.connect(instance);
    await adapter.loadOptionalFullText();
    await adapter.applyLockdown();
    return adapter;
  }

  private static async connect(instance: DuckDBInstance): Promise<DuckDbAdapter> {
    const connection = await instance.connect();
    return new DuckDbAdapter(instance, connection);
  }

  async run(sql: string, values: DatabaseValue[] = []): Promise<void> {
    const result = await this.connection.run(sql, values);
    result.closeSync();
  }

  async readRows(sql: string, values: DatabaseValue[] = []): Promise<Record<string, unknown>[]> {
    const reader = await this.connection.runAndReadAll(sql, values);
    return reader.getRowObjectsJS();
  }

  async loadFullText(): Promise<void> {
    // Why: the writer installs the extension when it is missing; a failure (no network) is an error for the load that needs it, not for the whole store.
    await this.run(`INSTALL ${FULL_TEXT_EXTENSION}`);
    await this.run(`LOAD ${FULL_TEXT_EXTENSION}`);
  }

  close(): void {
    this.connection.closeSync();
    this.instance.closeSync();
  }

  private async loadOptionalFullText(): Promise<void> {
    try {
      await this.run(`LOAD ${FULL_TEXT_EXTENSION}`);
    } catch {
      // Why: without the extension only search_chunks fails; every other query still runs.
    }
  }

  private async applyLockdown(): Promise<void> {
    // Why: after the extension is loaded, local files are disabled and autoload and autoinstall are off, so a query cannot read a file, reach the network or load another extension.
    await this.run("SET autoinstall_known_extensions = false");
    await this.run("SET autoload_known_extensions = false");
    await this.run("SET disabled_filesystems = 'LocalFileSystem'");
  }
}
