import { z } from "zod";

// Why: GDELT names the fields of an article as it sends them; the fields the server stores are checked here, and a missing one fails the load.
export const GdeltArticlesSchema = z.object({
  articles: z.array(z.looseObject({
    url: z.string(),
    title: z.string().nullable().optional(),
    seendate: z.string(),
    domain: z.string().nullable().optional(),
    language: z.string().nullable().optional(),
    sourcecountry: z.string().nullable().optional(),
  })),
});
