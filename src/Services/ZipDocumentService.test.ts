import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ZipDocumentService } from "@/Services/ZipDocumentService.ts";

const FIXTURE = join(import.meta.dirname, "..", "Testing", "fixtures", "dfp", "attachments-sample.zip");
const readFixture = (): Uint8Array => new Uint8Array(readFileSync(FIXTURE));

describe("ZipDocumentService.extract()", () => {
  it("adds the notes after the rendered PDF, and reports the skipped attachment (issue #61, phase 4)", async () => {
    const document = await ZipDocumentService.extract(readFixture());

    expect(document.format).toBe("pdf");
    expect(document.skippedAttachments).toBe(1);
    expect(document.segments.some((segment) => segment.section === "NotasExplicativas")).toBe(true);
    expect(document.segments.some((segment) => segment.section === null)).toBe(true);
  });
});
