import type { GuideTopic } from "@/Protocols/GetGuideProtocol.ts";
import { LIMITS_GUIDE } from "@/Guides/LimitsGuide.ts";
import { ANALYSIS_GUIDE } from "@/Guides/AnalysisGuide.ts";
import { SEARCH_GUIDE } from "@/Guides/SearchGuide.ts";
import { SOURCES_GUIDE } from "@/Guides/SourcesGuide.ts";
import { SQL_GUIDE } from "@/Guides/SqlGuide.ts";

export class GuideTexts {
  // Why: a guide is read by the model in one call, so its size is bounded here and checked by a test.
  static readonly MAX_CHARS = 4000;

  static readonly topicToText: Record<GuideTopic, string> = {
    sql: SQL_GUIDE,
    search: SEARCH_GUIDE,
    sources: SOURCES_GUIDE,
    analysis: ANALYSIS_GUIDE,
    limits: LIMITS_GUIDE,
  };
}
