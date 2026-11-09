const SEPARATOR = ";";

export class CsvUtil {
  static async* readRecords(lines: AsyncIterable<string>): AsyncGenerator<Record<string, string>> {
    // Why: a file's first line names its columns; each following line is read as a record keyed by those names, so a column is found by name, not by position.
    let header: string[] | undefined;
    for await (const line of lines) {
      const cells = line.split(SEPARATOR);
      if (header === undefined) {
        header = cells.map((cell) => cell.trim());
        continue;
      }
      const columnToCell: Record<string, string> = {};
      header.forEach((name, index) => {
        columnToCell[name] = (cells[index] ?? "").trim();
      });
      yield columnToCell;
    }
  }

  static readNumber(text: string | undefined): number | null {
    if (text === undefined || text.trim() === "") {
      return null;
    }
    const value = Number(text);
    if (!Number.isFinite(value)) {
      throw new Error(`the response format changed: ${text} is not a number; no row was written`);
    }
    return value;
  }

  static readText(text: string | undefined): string | null {
    return text === undefined || text.trim() === "" ? null : text.trim();
  }
}
