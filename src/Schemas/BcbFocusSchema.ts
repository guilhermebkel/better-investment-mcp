import { z } from "zod";

type BcbFocusWire = {
  readonly indicator: "Indicador";
  readonly detail: "IndicadorDetalhe";
  readonly surveyDate: "Data";
  readonly referenceYear: "DataReferencia";
  readonly mean: "Media";
  readonly median: "Mediana";
  readonly stdDev: "DesvioPadrao";
  readonly min: "Minimo";
  readonly max: "Maximo";
  readonly respondents: "numeroRespondentes";
  readonly calculationBase: "baseCalculo";
  readonly value: "value";
};

// Why: the Olinda service names its fields in Portuguese PascalCase; they are read through these constants, so the code keeps camelCase names.
export const BCB_FOCUS_WIRE: BcbFocusWire = {
  indicator: "Indicador",
  detail: "IndicadorDetalhe",
  surveyDate: "Data",
  referenceYear: "DataReferencia",
  mean: "Media",
  median: "Mediana",
  stdDev: "DesvioPadrao",
  min: "Minimo",
  max: "Maximo",
  respondents: "numeroRespondentes",
  calculationBase: "baseCalculo",
  value: "value",
};

// Why: the stats of a survey are null for older surveys (the service did not publish them then), so each one is nullable.
export const BcbFocusEntrySchema = z.object({
  [BCB_FOCUS_WIRE.indicator]: z.string(),
  [BCB_FOCUS_WIRE.detail]: z.string().nullable(),
  [BCB_FOCUS_WIRE.surveyDate]: z.string(),
  [BCB_FOCUS_WIRE.referenceYear]: z.string(),
  [BCB_FOCUS_WIRE.mean]: z.number().nullable(),
  [BCB_FOCUS_WIRE.median]: z.number().nullable(),
  [BCB_FOCUS_WIRE.stdDev]: z.number().nullable(),
  [BCB_FOCUS_WIRE.min]: z.number().nullable(),
  [BCB_FOCUS_WIRE.max]: z.number().nullable(),
  [BCB_FOCUS_WIRE.respondents]: z.number().int().nullable(),
  [BCB_FOCUS_WIRE.calculationBase]: z.union([z.literal(0), z.literal(1)]),
});

export const BcbFocusResponseSchema = z.object({ [BCB_FOCUS_WIRE.value]: z.array(BcbFocusEntrySchema) });
