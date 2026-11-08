import { z } from "zod";
import type { GetGuideInput, GuideTopic } from "@/Protocols/GetGuideProtocol.ts";

export const GUIDE_TOPICS: readonly GuideTopic[] = ["sql", "search", "sources", "limits"];

export const GetGuideInputSchema: z.ZodType<GetGuideInput> = z.strictObject({
  topic: z.enum(GUIDE_TOPICS).describe(`The guide to read. One of: ${GUIDE_TOPICS.join(", ")}.`),
});
