import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DfpAttachmentService } from "@/Services/DfpAttachmentService.ts";

const FIXTURE = join(import.meta.dirname, "..", "Testing", "fixtures", "dfp", "attachments-sample.zip");
const readFixture = (): Uint8Array => new Uint8Array(readFileSync(FIXTURE));
const NOTES_TEXT = "A Companhia não está envolvida em processos sigilosos relevantes.";

describe("DfpAttachmentService.extract()", () => {
  it("reads the notes of the XML as their own section, with the page of their PDF (issue #61, phase 4)", async () => {
    const result = await DfpAttachmentService.extract(readFixture());

    expect(result.segments).toContainEqual({ section: "NotasExplicativas", page: 1, text: NOTES_TEXT });
  });

  it("does not read the management report (group 1653), which the rendered PDF contains (ADR 0045)", async () => {
    const result = await DfpAttachmentService.extract(readFixture());

    expect(result.segments.every((segment) => segment.section === "NotasExplicativas")).toBe(true);
  });

  it("skips an attachment that is not a PDF and counts it, and still reads the others (S31)", async () => {
    const result = await DfpAttachmentService.extract(readFixture());

    expect(result.skipped).toBe(1);
    expect(result.segments.length).toBeGreaterThan(0);
  });
});
