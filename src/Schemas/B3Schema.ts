import { z } from "zod";

// Why: the B3 listing routes answer a list of results; each entry is read by the fields the lookup needs and the rest is ignored.
export const B3FundListSchema = z.looseObject({
  results: z.array(z.looseObject({ id: z.number().int(), acronym: z.string().nullable() })),
});

export const B3FundDetailSchema = z.looseObject({
  cnpj: z.string().nullable(),
  tradingCode: z.string().nullable(),
  tradingCodeOthers: z.string().nullable(),
  fundName: z.string().nullable(),
});

export const B3CompanyListSchema = z.looseObject({
  results: z.array(z.looseObject({ codeCVM: z.string(), companyName: z.string().nullable() })),
});

export const B3CompanyDetailSchema = z.looseObject({
  cnpj: z.string().nullable(),
  code: z.string().nullable(),
  companyName: z.string().nullable(),
  otherCodes: z.array(z.looseObject({ code: z.string(), isin: z.string() })).nullable(),
});
