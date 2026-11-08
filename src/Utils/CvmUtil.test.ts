import { describe, expect, it } from "vitest";
import { CvmFailureError } from "@/Errors/CvmFailureError.ts";
import { HttpFailureError } from "@/Errors/HttpFailureError.ts";
import { HttpRefusedError } from "@/Errors/HttpRefusedError.ts";
import { CvmUtil } from "@/Utils/CvmUtil.ts";

describe("CvmUtil.classifyFailure()", () => {
  it("keeps a CVM failure as it is, so its class is not changed on the way out (AC7)", () => {
    const failure = new CvmFailureError("HTTP error: the vendor answered with status 500");
    expect(CvmUtil.classifyFailure(failure)).toBe(failure);
  });

  it("names a refused or blocked request as blocked (AC7)", () => {
    const refused = new HttpRefusedError("the response is larger than 10 bytes");
    expect(CvmUtil.classifyFailure(refused).message).toBe(
      "CVM: blocked or refused request: The HTTP request was refused: the response is larger than 10 bytes",
    );
  });

  it("names a status error as an HTTP error (AC7)", () => {
    const status = new HttpFailureError("the vendor answered with status 503", 503);
    expect(CvmUtil.classifyFailure(status).message).toMatch(/^CVM: HTTP error: /u);
  });

  it("names a file that cannot be read, such as a damaged zip, as a file that could not be read (AC7)", () => {
    expect(CvmUtil.classifyFailure(new Error("the file is not a zip archive")).message).toBe(
      "CVM: file could not be read: the file is not a zip archive",
    );
  });
});

describe("CvmUtil.resolveCnpj()", () => {
  it("names an unmapped ticker as pending and says no CNPJ was guessed (AC8)", async () => {
    const findNoCnpj = () => Promise.resolve(undefined);
    const attempt = CvmUtil.resolveCnpj(findNoCnpj, "BR", "ZZZZ3");
    await expect(attempt).rejects.toThrow(CvmFailureError);
    await expect(attempt).rejects.toThrow("unmapped: BR:ZZZZ3 is pending");
  });
});

describe("CvmUtil.readDigits()", () => {
  it("keeps only the digits of a formatted CNPJ", () => {
    expect(CvmUtil.readDigits("33.000.167/0001-01")).toBe("33000167000101");
  });
});
