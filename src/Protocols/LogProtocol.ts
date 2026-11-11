export type LogLevel = "error" | "warn" | "info" | "debug";

export type LogField = string | number | boolean | undefined;

export type LogFieldNameToValue = Record<string, LogField>;
