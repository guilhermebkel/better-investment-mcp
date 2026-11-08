import type { z } from "zod";
import type { OverviewDependencies } from "@/Protocols/GetOverviewProtocol.ts";
import type { QuerySqlDependencies } from "@/Protocols/QuerySqlProtocol.ts";

export type OperationData = Record<string, unknown>;

export type OperationOutput = {
  message: string;
  structuredResult?: OperationData;
};

export type OperationResult = OperationOutput & { isError: boolean };

export interface OperationPort<Input> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: z.ZodType<Input>;
  execute(input: Input): Promise<OperationResult>;
}

export type OperationDependencies = {
  querySql: QuerySqlDependencies; overview: OverviewDependencies;
};
