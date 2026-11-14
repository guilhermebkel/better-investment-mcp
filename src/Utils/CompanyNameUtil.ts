export class CompanyNameUtil {
  static normalize(name: string): string {
    // Why: a name is compared after one normalization (accents, case and spaces), so a name CVM writes in capitals with accents matches the same name in another case; nothing else is changed (issue #41, P3).
    return name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase().replace(/\s+/gu, " ").trim();
  }
}
