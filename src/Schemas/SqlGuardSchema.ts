import { z } from "zod";

export const ParsedSqlSchema = z.looseObject({
  error: z.boolean(),
  error_type: z.string().optional(),
  error_message: z.string().optional(),
  statements: z.array(z.looseObject({ node: z.unknown() })).optional(),
});

export const ColumnRefSchema = z.looseObject({
  type: z.literal("COLUMN_REF"),
  column_names: z.array(z.string()),
});

export const StringConstantSchema = z.looseObject({
  type: z.literal("VALUE_CONSTANT"),
  literal: z.looseObject({ kind: z.literal("STRING"), text: z.string() }),
});

export const BaseTableSchema = z.looseObject({
  type: z.literal("BASE_TABLE"),
  table_name: z.string(),
  alias: z.string().optional(),
});

export const JoinSchema = z.looseObject({
  type: z.literal("JOIN"),
  left: z.unknown(),
  right: z.unknown(),
  condition: z.unknown(),
});

export const TableFunctionSchema = z.looseObject({
  type: z.literal("TABLE_FUNCTION"),
  function: z.looseObject({
    function_name: z.string(),
    arguments: z.array(z.looseObject({ expression: z.unknown() })).optional(),
  }),
});

export const ConstantExpressionSchema = z.looseObject({
  type: z.literal("VALUE_CONSTANT"),
  literal: z.looseObject({ kind: z.string(), text: z.string().optional() }),
});

export const EqualityNodeSchema = z.looseObject({ left: z.unknown(), right: z.unknown() });

export const OperatorCastSchema = z.looseObject({
  type: z.literal("OPERATOR_CAST"),
  child: z.unknown(),
});

export const BetweenNodeSchema = z.looseObject({
  type: z.literal("COMPARE_BETWEEN"),
  input: z.unknown(),
  lower: z.unknown(),
  upper: z.unknown(),
});
