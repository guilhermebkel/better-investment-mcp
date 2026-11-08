import { z } from "zod";
import type { YahooChart } from "@/Protocols/YahooProtocol.ts";

const nullableNumbers = z.array(z.number().nullable());
const dividendEvent = z.object({ amount: z.number(), date: z.number() });
const splitEvent = z.object({ date: z.number(), numerator: z.number(), denominator: z.number() });

export const YahooChartSchema: z.ZodType<YahooChart> = z.object({
  chart: z.object({
    result: z.array(z.object({
      meta: z.object({
        symbol: z.string(),
        currency: z.string().nullable().optional(),
        longName: z.string().optional(),
        shortName: z.string().optional(),
      }),
      timestamp: z.array(z.number()).optional(),
      indicators: z.object({
        quote: z.array(z.object({
          open: nullableNumbers,
          high: nullableNumbers,
          low: nullableNumbers,
          close: nullableNumbers,
          volume: nullableNumbers,
        })),
        adjclose: z.array(z.object({ adjclose: nullableNumbers })).optional(),
      }),
      // Why: the vendor names these keys dividends and splits; the adapter reads them under date-keyed names.
      events: z.object({
        dividends: z.record(z.string(), dividendEvent).optional(),
        splits: z.record(z.string(), splitEvent).optional(),
      }).optional().transform((events) => ({
        dateToDividend: events?.dividends,
        dateToSplit: events?.splits,
      })),
    })).nullable(),
    error: z.object({ code: z.string(), description: z.string() }).nullable(),
  }),
});
