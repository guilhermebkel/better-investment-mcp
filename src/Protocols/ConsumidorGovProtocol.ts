export type ConsumidorGovMonthFile = {
  month: string;
  url: string;
};

export type ConsumidorGovTradeCounts = {
  complaints: number;
  answered: number;
  rated: number;
  resolved: number;
  scoreSum: number;
  scoreCount: number;
  daysSum: number;
  daysCount: number;
};

export type ConsumidorGovSelection = {
  months: ConsumidorGovMonthFile[];
  notPublished: string[];
};

export type ConsumidorGovColumnToText = Record<string, string>;
