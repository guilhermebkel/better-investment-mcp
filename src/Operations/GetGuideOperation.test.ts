import { describe, expect, it } from "vitest";
import { GetGuideOperation } from "@/Operations/GetGuideOperation.ts";
import { GuideTexts } from "@/Guides/GuideTexts.ts";
import { GetGuideInputSchema, GUIDE_TOPICS } from "@/Schemas/GetGuideSchema.ts";

describe("GetGuideOperation.execute()", () => {
  it.each(GUIDE_TOPICS)("returns the text of the %s topic (AC3)", async (topic) => {
    const result = await new GetGuideOperation().execute({ topic });
    expect(result).toStrictEqual({ isError: false, message: GuideTexts.topicToText[topic] });
  });

  it("lists the valid topics when the topic is unknown (AC4)", () => {
    const parsed = GetGuideInputSchema.safeParse({ topic: "pricing" });
    const text = JSON.stringify(parsed.error?.issues ?? []);
    expect(parsed.success).toBe(false);
    expect(text).toContain("sql");
    expect(text).toContain("limits");
  });
});
