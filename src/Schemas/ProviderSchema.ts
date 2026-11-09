import { z } from "zod";
import type { ProviderFile, ProviderResult } from "@/Protocols/ProviderProtocol.ts";

const ProviderValueSchema = z.union([z.string(), z.number(), z.bigint(), z.boolean(), z.null()]);
const ProviderRowSchema = z.record(z.string(), ProviderValueSchema);
const SHA256_LENGTH = 64;

export const ProviderFileSchema: z.ZodType<ProviderFile> = z.object({
  url: z.string().min(1),
  dataset: z.string().min(1),
  referenceYear: z.number().int(),
  sha256: z.string().length(SHA256_LENGTH),
  sizeBytes: z.number().int().nonnegative(),
});

export const ProviderResultSchema: z.ZodType<ProviderResult> = z.object({
  source: z.string().min(1),
  tables: z.record(z.string(), z.array(ProviderRowSchema)),
  files: z.array(ProviderFileSchema).optional(),
});
