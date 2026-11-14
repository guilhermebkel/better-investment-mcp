import { describe, expect, it } from "vitest";
import { CompanyNameUtil } from "@/Utils/CompanyNameUtil.ts";

describe("CompanyNameUtil.normalize()", () => {
  it("compares names without accents, case or repeated spaces", () => {
    expect(CompanyNameUtil.normalize("  PETRÓLEO   Brasileiro S.A.  ")).toBe("PETROLEO BRASILEIRO S.A.");
  });

  it("changes nothing else, so a name with another word stays a different name", () => {
    expect(CompanyNameUtil.normalize("PETROBRAS DISTRIBUIDORA S.A.")).not.toBe(CompanyNameUtil.normalize("PETROBRAS"));
  });
});
