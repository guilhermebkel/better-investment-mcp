const ACCENTS = /\p{Diacritic}/gu;
const NOT_ALPHANUMERIC = /[^A-Z0-9]+/gu;

export class SearchTermUtil {
  static readTerm(code: string): string {
    // Why: an asset code holds a search term with `_` for a space (BR:complaints:MAGAZINE_LUIZA); the term is matched after one normalization (issue #59, S8).
    return SearchTermUtil.normalize(code.replace(/_/gu, " "));
  }

  static normalize(text: string): string {
    return text.normalize("NFD").replace(ACCENTS, "").toUpperCase().replace(NOT_ALPHANUMERIC, " ").replace(/\s+/gu, " ").trim();
  }

  static isMatch(name: string, term: string): boolean {
    return term !== "" && SearchTermUtil.normalize(name).includes(term);
  }
}
