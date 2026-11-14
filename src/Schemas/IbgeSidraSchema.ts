import { z } from "zod";

export type IbgeSidraColumnToText = Record<string, string>;

// Why: a SIDRA values response is a list whose first item names the columns; each following item is one value, with its variable, period and category codes as text.
export const IbgeSidraResponseSchema: z.ZodType<unknown[]> = z.array(z.unknown()).min(1);

export const IbgeSidraValueSchema: z.ZodType<IbgeSidraColumnToText> = z.record(z.string(), z.string());
