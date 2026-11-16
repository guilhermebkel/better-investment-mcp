import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FormReferenceService } from "@/Services/FormReferenceService.ts";

const FIXTURE = join(import.meta.dirname, "..", "Testing", "fixtures", "fre", "form-sample.zip");
// Why: the layout fixture is built from the real XML layout (issue #61, S17); it holds FormularioCadastral.xml before the FRE XML.
const LAYOUT_FIXTURE = join(import.meta.dirname, "..", "Testing", "fixtures", "fre", "item-layout-sample.zip");
const readFixture = (): Uint8Array => new Uint8Array(readFileSync(FIXTURE));
const readLayoutFixture = (): Uint8Array => new Uint8Array(readFileSync(LAYOUT_FIXTURE));

describe("FormReferenceService.extract()", () => {
  it("reads the PDF of each item, named by its form section and item number, page by page", async () => {
    const extracted = await FormReferenceService.extract(readFixture());

    expect(extracted.format).toBe("form");
    expect(extracted.segments).toContainEqual({
      section: "FatoresRisco 4.6", item: null, page: 1, text: "A Companhia não está envolvida em processos sigilosos relevantes.",
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

  it("reads the item number from the element that holds the PDF, not from its label (AC8, AC9)", async () => {
    const extracted = await FormReferenceService.extract(readLayoutFixture());
    const readItemOf = (prefix: string) => {
      const segment = extracted.segments.find((candidate) => candidate.section?.startsWith(prefix));
      return segment?.item;
    };

    expect(readItemOf("AtividadesEmissor IUH - 1.3")).toBe("1.3");
    expect(readItemOf("AtividadesEmissor FRE - IUH 1.9")).toBe("1.4");
    expect(readItemOf("AtividadesEmissor 1.04")).toBe("1.1");
  });

  it("keeps CVM's item when the label carries another number (AC10)", async () => {
    const extracted = await FormReferenceService.extract(readLayoutFixture());
    const segment = extracted.segments.find((candidate) => candidate.section?.startsWith("ControleGrupoEconomico 2.4"));

    expect(segment?.item).toBe("6.5");
  });

  it("gives NULL to a PDF directly under its section tag, and to an element that is not in the table (AC12)", async () => {
    const extracted = await FormReferenceService.extract(readLayoutFixture());
    const direct = extracted.segments.find((candidate) => candidate.section?.startsWith("FatoresRisco "));
    const unmapped = extracted.segments.find((candidate) => candidate.section?.startsWith("ControleGrupoEconomico Nao"));

    expect(direct?.item).toBeNull();
    expect(unmapped?.item).toBeNull();
  });

  it("reads the FRE XML even when FormularioCadastral.xml comes first in the zip (AC13)", async () => {
    const extracted = await FormReferenceService.extract(readLayoutFixture());

    expect(extracted.segments.length).toBeGreaterThan(0);
  });

  it("gives item 13.1 to a declaration signed by the president (AC11)", async () => {
    const extracted = await FormReferenceService.extract(readLayoutFixture());
    const segment = extracted.segments.find((candidate) => candidate.section?.startsWith("ResponsaveisFormulario"));

    expect(segment?.item).toBe("13.1");
  });

  it("writes item 8.10 as 8.10, not 8.1, when the element is OutorgaAcoes", async () => {
    const extracted = await FormReferenceService.extract(readLayoutFixture());
    const segment = extracted.segments.find((candidate) => candidate.section?.startsWith("RemuneracaoAdministradores 8.10"));

    expect(segment?.item).toBe("8.10");
  });
});
