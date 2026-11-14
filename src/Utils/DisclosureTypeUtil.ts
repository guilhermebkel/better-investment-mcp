import type { DisclosureDocumentType } from "@/Protocols/DocumentTypeProtocol.ts";

export class DisclosureTypeUtil {
  // Why: these types are listed by the disclosures category, not by the filings one (issue #42, S1).
  static readonly TYPES: readonly DisclosureDocumentType[] = ["fre", "vlmo", "cgvn"];

  static isDisclosure(documentType: string): boolean {
    return DisclosureTypeUtil.TYPES.some((known) => known === documentType);
  }
}
