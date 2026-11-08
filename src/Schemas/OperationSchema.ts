import { z } from "zod";
import type { OperationOutput } from "@/Protocols/OperationProtocol.ts";

export const OperationOutputSchema: z.ZodType<OperationOutput> = z.strictObject({
  message: z.string().describe("The answer to the model, in English."),
});
