import type { OutputLimitResult, OutputLimits } from "@/Protocols/OutputLimitProtocol.ts";

export class OutputLimitService {
  static readonly DEFAULT_LIMITS: OutputLimits = { maxRows: 1024, maxChars: 50_000 };

  private readonly maxRows: number;
  private readonly maxChars: number;

  constructor(limits: OutputLimits = OutputLimitService.DEFAULT_LIMITS) {
    this.maxRows = limits.maxRows;
    this.maxChars = limits.maxChars;
  }

  limit(rows: readonly string[]): OutputLimitResult {
    // Why: the cut is reported in rows and characters, so a client can tell the agent how much is left to ask for.
    const allText = rows.join("\n");
    const rowsWithinLimit = rows.slice(0, this.maxRows).join("\n");
    const limitedText = rowsWithinLimit.slice(0, this.maxChars);
    const returnedRows = limitedText === "" ? 0 : limitedText.split("\n").length;
    const remainingRows = rows.length - returnedRows;
    const remainingChars = allText.length - limitedText.length;
    const isTruncated = remainingRows > 0 || remainingChars > 0;
    return { returnedRows, remainingRows, remainingChars, isTruncated, text: limitedText };
  }
}
