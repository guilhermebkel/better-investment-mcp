import type { GetOverviewInput } from "@/Protocols/GetOverviewProtocol.ts";
import type { OperationPort, OperationResult } from "@/Protocols/OperationProtocol.ts";
import { GetOverviewInputSchema } from "@/Schemas/GetOverviewSchema.ts";

export class GetOverviewOperation implements OperationPort<GetOverviewInput> {
  static readonly NAME = "getOverview";
  static readonly USAGE_NOTICE = "Usage notice: the output describes and locates information. It is not investment advice, a recommendation or an analysis of what to buy or sell.";

  readonly name = GetOverviewOperation.NAME;
  readonly description = "Read-only. Describes the server and its usage notice. Call it first to see what the server does. It takes no input and returns a short text.";
  readonly inputSchema = GetOverviewInputSchema;

  execute(): OperationResult {
    return { isError: false, message: GetOverviewOperation.USAGE_NOTICE };
  }
}
