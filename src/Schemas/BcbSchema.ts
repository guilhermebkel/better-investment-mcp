import { z } from "zod";

export const BcbSeriesRowsSchema = z.array(z.object({
  data: z.string(),
  valor: z.string(),
}));
