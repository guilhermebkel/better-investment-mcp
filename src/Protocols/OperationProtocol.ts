import type { z } from "zod";
import type { OverviewDependencies } from "@/Protocols/GetOverviewProtocol.ts";
import type { NotifyLoadFinishDependencies } from "@/Protocols/NotifyLoadFinishProtocol.ts";
import type { QuerySqlDependencies } from "@/Protocols/QuerySqlProtocol.ts";

export type OperationData = Record<string, unknown>;

export type OperationOutput = {
  message: string;
  structuredResult?: OperationData;
};

export type OperationResult = OperationOutput & { isError: boolean };

export type OperationAnnotationName = "readOnlyHint" | "idempotentHint" | "openWorldHint" | "destructiveHint";

export type OperationAnnotationNameToFlag = Readonly<Record<OperationAnnotationName, boolean>>;

export type OperationAnnotations = OperationAnnotationNameToFlag;

export interface OperationPort<Input> {
  readonly name: string;
  readonly description: string;
  readonly annotations: OperationAnnotations;
  readonly inputSchema: z.ZodType<Input>;
  execute(input: Input): Promise<OperationResult>;
}

export type OperationDependencies = {
  querySql: QuerySqlDependencies;
  overview: OverviewDependencies;
  notifyLoadFinish: NotifyLoadFinishDependencies;
};
