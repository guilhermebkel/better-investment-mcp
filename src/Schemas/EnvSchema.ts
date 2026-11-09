import { z } from "zod";
import type { Env } from "@/Protocols/EnvProtocol.ts";

const DEFAULT_CACHE_TTL_SECONDS = 86_400;

const OptionalTextSchema = z.string().optional().transform((text) => (text === undefined || text === "" ? undefined : text));

const LogLevelSchema = OptionalTextSchema.pipe(
  z.enum(["error", "info", "debug"], { error: "INVESTMENT_MCP_LOG_LEVEL must be error, info or debug." }).optional(),
).transform((level) => level ?? "info");

// Why: the background threshold is the time a query waits for a load before it answers with the rows already stored.
export const DEFAULT_BACKGROUND_AFTER_SECONDS = 5;

const parsePositiveInteger = (name: string, defaultValue: number) => z
  .string()
  .optional()
  .transform((text, context) => {
    if (text === undefined || text === "") {
      return defaultValue;
    }
    const parsed = Number.parseInt(text, 10);
    if (Number.isNaN(parsed) || parsed < 1 || String(parsed) !== text.trim()) {
      context.addIssue({ code: "custom", message: `${name} must be a positive integer.` });
      return z.NEVER;
    }
    return parsed;
  });

export const RawEnvSchema: z.ZodType<Env> = z.object({
  INVESTMENT_MCP_LOG_LEVEL: LogLevelSchema,
  INVESTMENT_MCP_CACHE_DIR: OptionalTextSchema,
  INVESTMENT_MCP_CACHE_TTL_SECONDS: parsePositiveInteger("INVESTMENT_MCP_CACHE_TTL_SECONDS", DEFAULT_CACHE_TTL_SECONDS),
  INVESTMENT_MCP_BACKGROUND_AFTER_SECONDS: parsePositiveInteger("INVESTMENT_MCP_BACKGROUND_AFTER_SECONDS", DEFAULT_BACKGROUND_AFTER_SECONDS),
  INVESTMENT_MCP_QUOTES_PROVIDER: OptionalTextSchema,
  INVESTMENT_MCP_DIVIDENDS_PROVIDER: OptionalTextSchema,
  INVESTMENT_MCP_FUNDAMENTALS_PROVIDER: OptionalTextSchema,
  INVESTMENT_MCP_STATEMENTS_PROVIDER: OptionalTextSchema,
  INVESTMENT_MCP_FUND_DATA_PROVIDER: OptionalTextSchema,
  INVESTMENT_MCP_FILINGS_PROVIDER: OptionalTextSchema,
  INVESTMENT_MCP_DOCUMENTS_PROVIDER: OptionalTextSchema,
  INVESTMENT_MCP_MACRO_PROVIDER: OptionalTextSchema,
  INVESTMENT_MCP_TREASURY_PROVIDER: OptionalTextSchema,
  INVESTMENT_MCP_EXPECTATIONS_PROVIDER: OptionalTextSchema,
  INVESTMENT_MCP_IDENTIFIERS_PROVIDER: OptionalTextSchema,
  INVESTMENT_MCP_REGISTRY_PROVIDER: OptionalTextSchema,
  INVESTMENT_MCP_FX_PROVIDER: OptionalTextSchema,
  INVESTMENT_MCP_FUND_PROVIDER: OptionalTextSchema,
  INVESTMENT_MCP_DISCLOSURES_PROVIDER: OptionalTextSchema,
});
