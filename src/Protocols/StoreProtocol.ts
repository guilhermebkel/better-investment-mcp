import type { DatabasePort } from "@/Protocols/DatabaseProtocol.ts";

export type UsableOutcome = {
  kind: "usable";
  writer: DatabasePort;
};

export type ReplaceOutcome = {
  kind: "replace";
  reason: string;
};

export type OpenOutcome = UsableOutcome | ReplaceOutcome;

export type TableCountRow = { tableCount: number };

export type SchemaVersionRow = { version: number };
