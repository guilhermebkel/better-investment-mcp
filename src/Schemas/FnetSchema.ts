import { z } from "zod";
import type { FnetDocumentItem, FnetSearchResponse } from "@/Protocols/FnetProtocol.ts";

export const FnetDocumentItemSchema: z.ZodType<FnetDocumentItem> = z.object({
  id: z.number().int(),
  versao: z.number().int().default(1),
  tipoDocumento: z.string().nullable().optional(),
  categoriaDocumento: z.string().nullable().optional(),
  dataEntrega: z.string().nullable().optional(),
  dataReferencia: z.string().nullable().optional(),
  descricaoFundo: z.string().nullable().optional(),
  descricaoModalidade: z.string().nullable().optional(),
  descricaoStatus: z.string().nullable().optional(),
});

export const FnetSearchResponseSchema: z.ZodType<FnetSearchResponse> = z.object({
  data: z.array(FnetDocumentItemSchema).nullish().transform((items) => items ?? []),
  recordsTotal: z.number().int().nonnegative().default(0),
  recordsFiltered: z.number().int().nonnegative().optional(),
});
