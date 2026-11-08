export type YahooQuoteBlock = {
  open: (number | null)[];
  high: (number | null)[];
  low: (number | null)[];
  close: (number | null)[];
  volume: (number | null)[];
};

export type YahooMeta = {
  symbol: string;
  currency?: string | null;
  longName?: string;
  shortName?: string;
};

export type YahooIndicators = {
  quote: YahooQuoteBlock[];
  adjclose?: { adjclose: (number | null)[] }[];
};

export type YahooDividendEvent = {
  amount: number;
  date: number;
};

export type YahooSplitEvent = {
  date: number;
  numerator: number;
  denominator: number;
};

export type YahooEvents = {
  dateToDividend?: Readonly<Record<string, YahooDividendEvent>>;
  dateToSplit?: Readonly<Record<string, YahooSplitEvent>>;
};

export type YahooChartResult = {
  meta: YahooMeta;
  timestamp?: number[];
  indicators: YahooIndicators;
  events?: YahooEvents;
};

export type YahooChartError = {
  code: string;
  description: string;
};

export type YahooChart = {
  chart: {
    result: YahooChartResult[] | null;
    error: YahooChartError | null;
  };
};

export type KnownMarket = "BR" | "US";

export type YahooDay = {
  timestamp: number;
  index: number;
  close: number;
};
