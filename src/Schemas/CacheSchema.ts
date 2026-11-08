import { z } from "zod";
import type { FreshRunRow } from "@/Protocols/CacheProtocol.ts";

export const FreshRunRowsSchema: z.ZodType<FreshRunRow[]> = z.array(z.object({ freshRunCount: z.number() }));

export const SourceRowsSchema = z.array(z.object({ source: z.string() }));

export const PeriodRowsSchema = z.array(z.object({
  firstDate: z.string().nullable(),
  lastDate: z.string().nullable(),
}));
