import { z } from "zod";

const nullableNumber = z.number().nullable();

// Why: the Python script writes camelCase keys; a value the library does not give is null, never zero.
export const YfinanceSchema = z.object({
  quotes: z.array(z.object({
    date: z.string(),
    open: nullableNumber,
    high: nullableNumber,
    low: nullableNumber,
    close: nullableNumber,
    adjClose: nullableNumber,
    volume: nullableNumber,
  })),
  dividends: z.array(z.object({ exDate: z.string(), amount: z.number() })),
  splits: z.array(z.object({ date: z.string(), ratio: z.number() })),
  currency: z.string().nullable(),
  name: z.string().nullable(),
});
