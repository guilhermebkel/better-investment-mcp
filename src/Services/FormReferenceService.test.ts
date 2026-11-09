import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FormReferenceService } from "@/Services/FormReferenceService.ts";

const FIXTURE = join(import.meta.dirname, "..", "Testing", "fixtures", "fre", "form-sample.zip");
const readFixture = (): Uint8Array => new Uint8Array(readFileSync(FIXTURE));

describe("FormReferenceService.extract()", () => {
  it("reads the PDF of each item, named by its form section and item number, page by page", async () => {
    const extracted = await FormReferenceService.extract(readFixture());

    expect(extracted.format).toBe("form");
    expect(extracted.segments).toContainEqual({
      section: "FatoresRisco 4.6", page: 1, text: "A Companhia não está envolvida em processos sigilosos relevantes.",
    });
  });

  it("restores the accents of an item name that CVM keeps in UTF-8", async () => {
    const extracted = await FormReferenceService.extract(readFixture());

    expect(extracted.segments.map((segment) => segment.section)).toContain("ResponsaveisFormulario Declaração do diretor");
  });

  it("skips a blank slot of the form, with no document in it", async () => {
    const extracted = await FormReferenceService.extract(readFixture());

    expect(extracted.segments.some((segment) => segment.section?.includes("documento") === true)).toBe(false);
  });

  it("refuses a zip that holds no XML", async () => {
    const fixture = join(import.meta.dirname, "..", "Testing", "fixtures", "cvm-registry", "fre-sample-2024.zip");
    const notForm = new Uint8Array(readFileSync(fixture));

    await expect(FormReferenceService.extract(notForm)).rejects.toThrow("the form zip has no XML");
  });
});
