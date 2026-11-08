import type { OperationPort, OperationResult } from "@/Protocols/OperationProtocol.ts";
import type { QuerySqlInput } from "@/Protocols/QuerySqlProtocol.ts";
import { QuerySqlInputSchema } from "@/Schemas/QuerySqlSchema.ts";
import { OutputLimitService } from "@/Services/OutputLimitService.ts";

export class QuerySqlOperation implements OperationPort<QuerySqlInput> {
  static readonly NAME = "querySql";
  static readonly NOT_CONNECTED_MESSAGE = "The data store is not connected yet, so no query runs. Nothing was run. Read get_overview for what the server does.";

  readonly name = QuerySqlOperation.NAME;
  readonly description = `Read-only. Runs one SELECT over the server's tables and returns the rows. Use it for every data question. Output is limited to ${OutputLimitService.DEFAULT_LIMITS.maxRows} rows and ${OutputLimitService.DEFAULT_LIMITS.maxChars} characters, and a cut is reported. Returns an error when the query cannot run.`;
  readonly inputSchema = QuerySqlInputSchema;

  execute(): OperationResult {
    return { isError: true, message: QuerySqlOperation.NOT_CONNECTED_MESSAGE };
  }
}
