import { z } from "zod";
import type { LegalIdRow, SchemaVersionRow, TableCountRow } from "@/Protocols/StoreProtocol.ts";

export const TableCountRowsSchema: z.ZodType<TableCountRow[]> = z.array(z.object({ tableCount: z.number() }));

export const SchemaVersionRowsSchema: z.ZodType<SchemaVersionRow[]> = z.array(z.object({ version: z.number() }));

export const LegalIdRowsSchema: z.ZodType<LegalIdRow[]> = z.array(z.object({ legal_id: z.string().nullable() }));
