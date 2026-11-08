import { z } from "zod";
import type { ProviderResult } from "@/Protocols/ProviderProtocol.ts";

const ProviderValueSchema = z.union([z.string(), z.number(), z.bigint(), z.boolean(), z.null()]);
const ProviderRowSchema = z.record(z.string(), ProviderValueSchema);

export const ProviderResultSchema: z.ZodType<ProviderResult> = z.object({
  source: z.string().min(1),
  tables: z.record(z.string(), z.array(ProviderRowSchema)),
});
