import { GetGuideOperation } from "@/Operations/GetGuideOperation.ts";
import { GetOverviewOperation } from "@/Operations/GetOverviewOperation.ts";
import { NotifyLoadFinishOperation } from "@/Operations/NotifyLoadFinishOperation.ts";
import { QuerySqlOperation } from "@/Operations/QuerySqlOperation.ts";
import type { OperationDependencies, OperationPort } from "@/Protocols/OperationProtocol.ts";

const UPPER_CASE_LETTER = /[A-Z]/g;

export class OperationManifestSurface {
  static listOperations(dependencies: OperationDependencies): readonly OperationPort<unknown>[] {
    const overview = new GetOverviewOperation(dependencies.overview);
    const querySql = new QuerySqlOperation(dependencies.querySql);
    const notifyLoadFinish = new NotifyLoadFinishOperation(dependencies.notifyLoadFinish);
    return [overview, new GetGuideOperation(), querySql, notifyLoadFinish];
  }

  static formatToolName(operationName: string): string {
    return operationName.replaceAll(UPPER_CASE_LETTER, (letter) => `_${letter.toLowerCase()}`);
  }
}
