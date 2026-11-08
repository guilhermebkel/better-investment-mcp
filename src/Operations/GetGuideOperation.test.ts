import { describe, expect, it } from "vitest";
import { GetGuideOperation } from "@/Operations/GetGuideOperation.ts";

describe("GetGuideOperation.execute()", () => {
  it("answers the placeholder for the topic asked", async () => {
    const result = await new GetGuideOperation().execute({ topic: "sql" });

    expect(result).toStrictEqual({ isError: false, message: "The guide for \"sql\" has no text yet." });
  });
});
