import { GetGuideOperation } from "@/Operations/GetGuideOperation.ts";
import { GetOverviewOperation } from "@/Operations/GetOverviewOperation.ts";
import { QuerySqlOperation } from "@/Operations/QuerySqlOperation.ts";
import type { OperationDependencies, OperationPort } from "@/Protocols/OperationProtocol.ts";

const UPPER_CASE_LETTER = /[A-Z]/g;

export class OperationManifestSurface {
  static listOperations(dependencies: OperationDependencies): readonly OperationPort<unknown>[] {
    return [new GetOverviewOperation(), new GetGuideOperation(), new QuerySqlOperation(dependencies.querySql)];
  }

  static formatToolName(operationName: string): string {
    return operationName.replaceAll(UPPER_CASE_LETTER, (letter) => `_${letter.toLowerCase()}`);
  }
}
