import { z } from "zod";
import type { QuerySqlInput } from "@/Protocols/QuerySqlProtocol.ts";

export const QUERY_SQL_MAX_CHARS = 10_000;

export const QuerySqlInputSchema: z.ZodType<QuerySqlInput> = z.strictObject({
  sql: z.string().min(1).max(QUERY_SQL_MAX_CHARS).describe(`One SELECT statement as plain text, at most ${QUERY_SQL_MAX_CHARS} characters.`),
});
