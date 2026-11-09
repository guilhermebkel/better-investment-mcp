const WHITESPACE = /\s+/gu;
const REPLACEMENT_CHARACTER = "�";

export class TextUtil {
  static normalize(text: string): string {
    return text.replace(WHITESPACE, " ").trim();
  }

  static repairUtf8(text: string): string {
    // Why: some CVM form files keep names in UTF-8 inside a file read as cp1252, so an accented name reads as two letters; the round trip restores it, and a text that does not round trip is kept as it is.
    const repaired = Buffer.from(text, "latin1").toString("utf8");
    return repaired.includes(REPLACEMENT_CHARACTER) ? text : repaired;
  }
}
