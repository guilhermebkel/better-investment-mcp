import type { OperationData, OperationPort, OperationResult } from "@/Protocols/OperationProtocol.ts";
import type { LoadedEntry } from "@/Protocols/LoaderProtocol.ts";
import type { QuerySqlDependencies, QuerySqlInput } from "@/Protocols/QuerySqlProtocol.ts";
import { QuerySqlInputSchema } from "@/Schemas/QuerySqlSchema.ts";
import { OutputLimitService } from "@/Services/OutputLimitService.ts";

const convertValue = (value: unknown): unknown => {
  // Why: the agent's JSON cannot hold a bigint, so counts that DuckDB returns as bigint become numbers.
  return typeof value === "bigint" ? Number(value) : value;
};
const convertRow = (row: Record<string, unknown>): Record<string, unknown> => {
  return Object.fromEntries(Object.entries(row).map(([name, value]) => [name, convertValue(value)]));
};

export class QuerySqlOperation implements OperationPort<QuerySqlInput> {
  static readonly NAME = "querySql";
  static readonly DESCRIPTION = "Read-only. Runs one SELECT over the server's tables and returns the rows. "
    + "Every data table in the query needs WHERE filters on market, ticker and asset_type, compared with = or IN "
    + "and literal values; a query without them is refused with the filter to add. Output is limited to "
    + `${OutputLimitService.DEFAULT_LIMITS.maxRows} rows and ${OutputLimitService.DEFAULT_LIMITS.maxChars} characters, `
    + "and a cut is reported. "
    + "Returns an error when the query is refused or fails.";

  readonly name = QuerySqlOperation.NAME;
  readonly description = QuerySqlOperation.DESCRIPTION;
  readonly inputSchema = QuerySqlInputSchema;

  private readonly dependencies: QuerySqlDependencies;

  constructor(dependencies: QuerySqlDependencies) {
    this.dependencies = dependencies;
  }

  async execute(input: QuerySqlInput): Promise<OperationResult> {
    const verdict = await this.dependencies.guard.checkSql(input.sql);
    if (!verdict.isAccepted) {
      return { isError: true, message: verdict.message };
    }
    const loaded = await this.dependencies.loader.ensure(verdict.requirements);
    const reader = await this.dependencies.openReader();
    let rows: Record<string, unknown>[];
    try {
      rows = await reader.readRows(input.sql);
    } catch (error) {
      return { isError: true, message: `The query failed: ${error instanceof Error ? error.message : "unknown error"}` };
    } finally {
      reader.close();
    }
    return QuerySqlOperation.answer(rows, loaded);
  }

  private static answer(rows: Record<string, unknown>[], loaded: LoadedEntry[]): OperationResult {
    const plainRows = rows.map(convertRow);
    const limited = new OutputLimitService().limit(plainRows.map((row) => JSON.stringify(row)));
    const unloaded = loaded.filter((entry) => entry.status === "failed");
    // Why: an empty answer for an asset that failed to load says so, so the agent does not read it as "no data".
    const causes = unloaded.map((entry) => entry.error ?? "unknown error").join("; ");
    const emptyMessage = rows.length === 0 && unloaded.length > 0
      ? `No rows. Some assets were not loaded: ${causes}. Check loaded for each asset.`
      : `${limited.returnedRows} rows.`;
    const cutMessage = limited.isTruncated
      ? ` The answer was cut: ${limited.remainingRows} rows and ${limited.remainingChars} characters were left out. Narrow the query to get the rest.`
      : "";
    const structuredResult: OperationData = {
      rows: plainRows.slice(0, limited.returnedRows),
      truncated: limited.isTruncated,
      remainingRows: limited.remainingRows,
      remainingChars: limited.remainingChars,
      loaded,
    };
    return { isError: false, message: `${emptyMessage}${cutMessage}\n${limited.text}`, structuredResult };
  }
}
