import { z } from "zod";
import type { FreshRunRow } from "@/Protocols/CacheProtocol.ts";

export const FreshRunRowsSchema: z.ZodType<FreshRunRow[]> = z.array(z.object({ freshRunCount: z.number() }));
