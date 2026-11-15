import { z } from "zod";

// Why: a publication names its file and its code; the other fields are read by no adapter, so they are not checked here.
export const ConsumidorGovPublicationsSchema = z.array(z.looseObject({
  nomeArquivo: z.string(),
  codigo: z.string(),
  tamanhoArquivo: z.number().optional(),
}));
