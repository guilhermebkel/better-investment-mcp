import type { GetGuideInput } from "@/Protocols/GetGuideProtocol.ts";
import type { OperationPort, OperationResult } from "@/Protocols/OperationProtocol.ts";
import { GetGuideInputSchema } from "@/Schemas/GetGuideSchema.ts";

export class GetGuideOperation implements OperationPort<GetGuideInput> {
  static readonly NAME = "getGuide";

  readonly name = GetGuideOperation.NAME;
  readonly description = "Read-only. Returns the guide for one topic: how to write a query for query_sql, with examples. Use it before query_sql when the syntax is unclear. It returns text only.";
  readonly inputSchema = GetGuideInputSchema;

  execute(input: GetGuideInput): OperationResult {
    return { isError: false, message: `The guide for "${input.topic}" has no text yet.` };
  }
}
