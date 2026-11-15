import { z } from "zod";

// Why: IFData writes its fields in PascalCase; the names are constants, so the schema reads them as the service names them.
const CODE_FIELD = "CodInst";
const LEADER_ROOT_FIELD = "CnpjInstituicaoLider";
const ACCOUNT_FIELD = "Conta";
const AMOUNT_FIELD = "Saldo";

export const IfDataCadastroSchema = z.object({
  value: z.array(z.looseObject({
    [CODE_FIELD]: z.string(),
    [LEADER_ROOT_FIELD]: z.string().nullable(),
  })),
});

export const IfDataValoresSchema = z.object({
  value: z.array(z.looseObject({
    [CODE_FIELD]: z.string(),
    [ACCOUNT_FIELD]: z.string(),
    [AMOUNT_FIELD]: z.number().nullable(),
  })),
});
