import { z } from "zod";

const RankSchema = z.looseObject({ rank: z.number().int() });
const IndicatorSchema = z.object({ key: z.string(), ranks: z.array(RankSchema) });

export const IndicatorHistoricalSchema = z.object({ data: z.array(IndicatorSchema) });

export const ProventsSchema = z.object({
  assetEarningsModels: z.array(z.object({ pd: z.string(), v: z.number() })),
});

const MonthSchema = z.record(z.string(), z.unknown());
export const MonthlySectionSchema = z.object({ listMonth: z.array(MonthSchema) });
