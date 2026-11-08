import type { LogFieldNameToValue, LogLevel } from "@/Protocols/LogProtocol.ts";

const LEVELS_FROM_LEAST_TO_MOST_VERBOSE: readonly LogLevel[] = ["error", "info", "debug"];

export class LogUtil {
  private static threshold: LogLevel = "info";

  static setLevel(level: LogLevel): void {
    LogUtil.threshold = level;
  }

  static logDebug(event: string, fields: LogFieldNameToValue): void {
    LogUtil.write("debug", event, fields);
  }

  static logInfo(event: string, fields: LogFieldNameToValue = {}): void {
    LogUtil.write("info", event, fields);
  }

  static logError(event: string, detail: string): void {
    LogUtil.write("error", event, { detail });
  }

  static showMessage(text: string): void {
    // Why: stdout belongs to the MCP protocol, so text for a person also goes to stderr.
    process.stderr.write(`${text}\n`);
  }

  private static write(level: LogLevel, event: string, fields: LogFieldNameToValue): void {
    const findVerbosity = (name: LogLevel): number => LEVELS_FROM_LEAST_TO_MOST_VERBOSE.indexOf(name);
    if (findVerbosity(level) > findVerbosity(LogUtil.threshold)) {
      return;
    }
    // Why: stdout belongs to the MCP protocol, so every log line goes to stderr.
    process.stderr.write(`${JSON.stringify({ level, event, ...fields })}\n`);
  }
}
