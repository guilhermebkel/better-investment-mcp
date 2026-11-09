import { z } from "zod";

// Why: the table script is a separate program; what it prints is checked before any row is read from it.
const CellSchema = z.string();
const RowSchema = z.array(CellSchema);
const PageSchema = z.number().int().positive();
const TableSchema = z.object({ page: PageSchema, rows: z.array(RowSchema) });
export const PdfTablesSchema = z.array(TableSchema);
