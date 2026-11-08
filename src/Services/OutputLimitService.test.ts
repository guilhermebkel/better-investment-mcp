import { describe, expect, it } from "vitest";
import { OutputLimitService } from "@/Services/OutputLimitService.ts";

describe("OutputLimitService.limit()", () => {
  it("returns every row unchanged when the answer is exactly at the row limit", () => {
    const rows = Array.from({ length: 1024 }, () => "a");

    expect(new OutputLimitService().limit(rows)).toStrictEqual({
      text: rows.join("\n"),
      returnedRows: 1024,
      remainingRows: 0,
      remainingChars: 0,
      isTruncated: false,
    });
  });

  describe("when there is one row more than the row limit", () => {
    it("cuts the last row and reports one row and two characters left", () => {
      const rows = Array.from({ length: 1025 }, () => "a");

      expect(new OutputLimitService().limit(rows)).toStrictEqual({
        text: Array.from({ length: 1024 }, () => "a").join("\n"),
        returnedRows: 1024,
        remainingRows: 1,
        remainingChars: 2,
        isTruncated: true,
      });
    });
  });

  describe("when a single cell is longer than the character limit", () => {
    it("cuts the cell at 50,000 characters and reports 10,000 characters left", () => {
      const hugeCell = "x".repeat(60_000);

      expect(new OutputLimitService().limit([hugeCell])).toStrictEqual({
        text: "x".repeat(50_000),
        returnedRows: 1,
        remainingRows: 0,
        remainingChars: 10_000,
        isTruncated: true,
      });
    });
  });

  describe("when the answer is exactly at the character limit", () => {
    it("keeps the cell and reports nothing cut", () => {
      const cell = "y".repeat(50_000);

      expect(new OutputLimitService().limit([cell])).toStrictEqual({
        text: cell,
        returnedRows: 1,
        remainingRows: 0,
        remainingChars: 0,
        isTruncated: false,
      });
    });
  });

  describe("when a custom limit is given", () => {
    it("cuts at the custom row limit", () => {
      const service = new OutputLimitService({ maxRows: 2, maxChars: 50_000 });

      expect(service.limit(["one", "two", "three"])).toStrictEqual({
        text: "one\ntwo",
        returnedRows: 2,
        remainingRows: 1,
        remainingChars: 6,
        isTruncated: true,
      });
    });
  });

  describe("when there are no rows", () => {
    it("returns an empty text that is not truncated", () => {
      expect(new OutputLimitService().limit([])).toStrictEqual({
        text: "",
        returnedRows: 0,
        remainingRows: 0,
        remainingChars: 0,
        isTruncated: false,
      });
    });
  });
});
