import { HttpFailureError } from "@/Errors/HttpFailureError.ts";
import { ProviderConfigError } from "@/Errors/ProviderConfigError.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import type { KnownMarket, YahooChart, YahooChartResult, YahooDay } from "@/Protocols/YahooProtocol.ts";
import type { ProviderPort, ProviderRequest, ProviderResult, ProviderRow, TableToRows } from "@/Protocols/ProviderProtocol.ts";
import { YahooChartSchema } from "@/Schemas/YahooSchema.ts";
import { QualityFlagService } from "@/Services/QualityFlagService.ts";

const MS_PER_SECOND = 1000;
const ISO_DATE_LENGTH = 10;
const NOT_FOUND_STATUS = 404;
const RATE_LIMIT_STATUS = 429;
const MARKET_TO_SUFFIX: ReadonlyMap<KnownMarket, string> = new Map<KnownMarket, string>([["BR", ".SA"], ["US", ""]]);

export class YahooAdapter<Category extends "quotes" | "dividends"> implements ProviderPort<Category> {
  static readonly VENDOR = "yahoo";
  static readonly HOST = "query1.finance.yahoo.com";
  static readonly BASE_URL = `https://${YahooAdapter.HOST}`;
  static readonly MARKETS: readonly KnownMarket[] = ["BR", "US"];
  static readonly ASSET_TYPES: readonly ("stock" | "fii" | "etf")[] = ["stock", "fii", "etf"];

  readonly category: Category;
  readonly vendor = YahooAdapter.VENDOR;
  readonly markets = YahooAdapter.MARKETS;
  readonly assetTypes = YahooAdapter.ASSET_TYPES;

  private readonly http: HttpPort;
  private readonly baseUrl: string;

  constructor(category: Category, http: HttpPort, baseUrl: string = YahooAdapter.BASE_URL) {
    this.category = category;
    this.http = http;
    this.baseUrl = baseUrl;
  }

  async fetchTables(request: ProviderRequest): Promise<ProviderResult> {
    if (request.assetType === undefined) {
      throw new Error("Yahoo needs the asset type of the asset");
    }
    const symbol = YahooAdapter.buildSymbol(request.market, request.ticker);
    const chart = await this.fetchChart(symbol);
    // Why: the quotes and dividends categories share one download, so both return every table Yahoo gives for the symbol.
    const tables = YahooAdapter.buildTables(chart, request.market, request.ticker, request.assetType);
    return { source: YahooAdapter.VENDOR, tables };
  }

  static buildSymbol(market: string, ticker: string): string {
    // Why: one place turns market:ticker into the Yahoo symbol, so a new market is added here and nowhere else.
    const suffix = YahooAdapter.readSuffix(market);
    if (suffix === undefined) {
      throw new ProviderConfigError(`Yahoo does not map the market ${market} to a symbol`);
    }
    return `${ticker}${suffix}`;
  }

  static buildTables(chart: YahooChart, market: string, ticker: string, assetType: string): TableToRows {
    const [result] = chart.chart.result ?? [];
    if (result === undefined) {
      return {};
    }
    const key = { market, ticker, asset_type: assetType };
    const assetRow: ProviderRow = {
      ...key,
      legal_id: null,
      name: result.meta.longName ?? result.meta.shortName ?? null,
      sector: null,
      currency: result.meta.currency ?? null,
    };
    return {
      assets: [assetRow],
      quotes: YahooAdapter.buildQuoteRows(result, key),
      dividends: YahooAdapter.buildDividendRows(result, key),
      splits: YahooAdapter.buildSplitRows(result, key),
    };
  }

  private static readSuffix(market: string): string | undefined {
    const entry = [...MARKET_TO_SUFFIX].find(([known]) => known === market);
    return entry?.[1];
  }

  private async fetchChart(symbol: string): Promise<YahooChart> {
    const chartPath = `${this.baseUrl}/v8/finance/chart/${encodeURIComponent(symbol)}`;
    let text: string;
    try {
      text = await this.http.getText(`${chartPath}?range=max&interval=1d&events=div,splits`);
    } catch (error) {
      if (error instanceof HttpFailureError && error.status === NOT_FOUND_STATUS) {
        throw new Error(`Yahoo did not find the symbol ${symbol}; no row was written`, { cause: error });
      }
      if (error instanceof HttpFailureError && error.status === RATE_LIMIT_STATUS) {
        const reason = "Yahoo answered with a rate limit; the run is recorded and the next load retries";
        throw new Error(reason, { cause: error });
      }
      throw error;
    }
    return YahooAdapter.parseChart(text, symbol);
  }

  private static parseChart(text: string, symbol: string): YahooChart {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (error) {
      throw new Error("the response format changed: Yahoo did not send JSON; no row was written", { cause: error });
    }
    const parsed = YahooChartSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error("the response format changed: the chart shape is not the one the adapter reads; no row was written");
    }
    const { error, result } = parsed.data.chart;
    if (error !== null && error.code === "Not Found") {
      throw new Error(`Yahoo did not find the symbol ${symbol}; no row was written`);
    }
    if (error !== null) {
      throw new Error(`Yahoo answered with an error: ${error.description}`);
    }
    if (result === null || result.length === 0) {
      throw new Error(`Yahoo did not find the symbol ${symbol}; no row was written`);
    }
    return parsed.data;
  }

  private static buildQuoteRows(result: YahooChartResult, key: ProviderRow): ProviderRow[] {
    const quote = result.indicators.quote[0];
    if (quote === undefined) {
      throw new Error("the response format changed: no quote block; no row was written");
    }
    const adjusted = result.indicators.adjclose?.[0]?.adjclose ?? [];
    // Why: a day without a close is a non-trading placeholder; it is skipped, never filled with a guessed value.
    const days = (result.timestamp ?? [])
      .map((timestamp, index) => ({ timestamp, index, close: quote.close[index] ?? null }))
      .filter((day): day is YahooDay => day.close !== null);
    const points = days.map((day) => ({ close: day.close, volume: quote.volume[day.index] ?? null }));
    const flags = QualityFlagService.buildFlags(points);
    return days.map((day, position) => ({
      ...key,
      date: YahooAdapter.formatDate(day.timestamp),
      open: quote.open[day.index] ?? null,
      high: quote.high[day.index] ?? null,
      low: quote.low[day.index] ?? null,
      close: day.close,
      adj_close: adjusted[day.index] ?? null,
      volume: quote.volume[day.index] ?? null,
      is_stale: flags[position]?.isStale ?? false,
      suspect_tick: flags[position]?.isSuspectTick ?? false,
      source: YahooAdapter.VENDOR,
    }));
  }

  private static buildDividendRows(result: YahooChartResult, key: ProviderRow): ProviderRow[] {
    // Why: Yahoo does not tell a dividend from interest on equity (JCP), so every row is kept as kind "dividend".
    return Object.values(result.events?.dateToDividend ?? {}).map((event) => ({
      ...key,
      ex_date: YahooAdapter.formatDate(event.date),
      pay_date: null,
      amount: event.amount,
      kind: "dividend",
      source: YahooAdapter.VENDOR,
    }));
  }

  private static buildSplitRows(result: YahooChartResult, key: ProviderRow): ProviderRow[] {
    // Why: the ratio is new shares per old share, so a 2-for-1 split is 2.
    return Object.values(result.events?.dateToSplit ?? {}).map((event) => ({
      ...key,
      date: YahooAdapter.formatDate(event.date),
      ratio: event.numerator / event.denominator,
      source: YahooAdapter.VENDOR,
    }));
  }

  private static formatDate(epochSeconds: number): string {
    return new Date(epochSeconds * MS_PER_SECOND).toISOString().slice(0, ISO_DATE_LENGTH);
  }
}
