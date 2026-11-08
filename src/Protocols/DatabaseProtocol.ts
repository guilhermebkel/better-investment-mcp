export type DatabaseValue = string | number | bigint | boolean | null;

export interface DatabasePort {
  run(sql: string, values?: DatabaseValue[]): Promise<void>;
  readRows(sql: string, values?: DatabaseValue[]): Promise<Record<string, unknown>[]>;
  close(): void;
}
