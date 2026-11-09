import { z } from "zod";

// Why: the PTAX service sends one bulletin per time of day (opening, intermediate, closing); the closing one is the official rate of the day.
export const BcbPtaxSchema = z.object({
  value: z.array(z.looseObject({
    cotacaoCompra: z.number().nullable(),
    cotacaoVenda: z.number().nullable(),
    dataHoraCotacao: z.string(),
    tipoBoletim: z.string(),
  })),
});
