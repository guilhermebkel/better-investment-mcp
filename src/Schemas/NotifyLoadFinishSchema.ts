import { z } from "zod";
import type { NotifyLoadFinishInput } from "@/Protocols/NotifyLoadFinishProtocol.ts";

const LOADING_ID_MAX_LENGTH = 64;
const CALLBACK_URL_MAX_LENGTH = 2000;

export const NotifyLoadFinishInputSchema: z.ZodType<NotifyLoadFinishInput> = z.strictObject({
  loading_id: z.string().min(1).max(LOADING_ID_MAX_LENGTH).describe("The loading id that a query answered with while its load was still running."),
  callback_url: z.string().min(1).max(CALLBACK_URL_MAX_LENGTH).describe("An https address that receives one POST with the final status of the load. Only its host is shown back."),
});
