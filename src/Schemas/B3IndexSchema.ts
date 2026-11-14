import { z } from "zod";
import type { B3IndexPortfolio } from "@/Protocols/IndexMembershipProviderProtocol.ts";

// Why: the portfolio of an index is read from the header date and the list of its assets; a result with no list is an empty portfolio.
export const B3IndexPortfolioSchema: z.ZodType<B3IndexPortfolio> = z.object({
  header: z.object({ date: z.string() }),
  results: z.array(z.object({ cod: z.string(), part: z.string().nullable() })).nullable(),
});
