import { DuckDBInstance } from "@duckdb/node-api";
import type { DuckDBConnection } from "@duckdb/node-api";
import type { DatabasePort, DatabaseValue } from "@/Protocols/DatabaseProtocol.ts";

export class DuckDbAdapter implements DatabasePort {
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
    // Why: a read-only instance with external access disabled refuses writes, file and network functions, so the query is not the only guard.
    const instance = await DuckDBInstance.create(databasePath, { access_mode: "READ_ONLY", enable_external_access: "false" });
    return DuckDbAdapter.connect(instance);
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
    return reader.getRowObjects();
  }

  close(): void {
    this.connection.closeSync();
    this.instance.closeSync();
  }
}
