import type { z } from "zod";

export type OperationOutput = { message: string };

export type OperationResult = OperationOutput & { isError: boolean };

export interface OperationPort<Input> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: z.ZodType<Input>;
  execute(input: Input): OperationResult;
}
