import { z } from "zod";
import type { OperationOutput } from "@/Protocols/OperationProtocol.ts";

export const OperationOutputSchema: z.ZodType<OperationOutput> = z.strictObject({
  message: z.string().describe("The answer to the model, in English. For query_sql it holds the rows as JSON lines."),
  structuredResult: z.record(z.string(), z.unknown()).optional()
    .describe("The same answer as structured data, when the operation has one."),
});
