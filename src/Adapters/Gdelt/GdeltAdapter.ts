import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import type { NewsProvider } from "@/Protocols/NewsProviderProtocol.ts";
import type { GdeltSearchWindow } from "@/Protocols/GdeltProtocol.ts";
import type { PeriodWindow } from "@/Protocols/PeriodProtocol.ts";
import type { ProviderRequest, ProviderResult, ProviderRow } from "@/Protocols/ProviderProtocol.ts";
import { GdeltArticlesSchema } from "@/Schemas/GdeltSchema.ts";
import { AssetIdUtil } from "@/Utils/AssetIdUtil.ts";

const DOC_PATH = "/api/v2/doc/doc";
const WINDOW_MONTHS = 3;
const MAX_RECORDS = 250;
const ISO_DAY_LENGTH = 10;
const RATE_LIMITED = "429";
// Why: GDELT writes a time as YYYYMMDDTHHMMSSZ, in UTC; the parts are read by this pattern.
const SEEN_TIME_PATTERN = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/u;
// Why: a search starts at the first second of its first day and ends at the last second of its last day.
const EDGE_TO_TIME: Readonly<Record<"start" | "end", string>> = { start: "000000", end: "235959" };

export class GdeltAdapter implements NewsProvider {
  static readonly VENDOR = "gdelt";
  static readonly HOST = "api.gdeltproject.org";
  static readonly BASE_URL = `https://${GdeltAdapter.HOST}`;

  readonly category = "news";
  readonly vendor = GdeltAdapter.VENDOR;
  readonly markets = ["BR"] as const;
  readonly assetTypes = ["news"] as const;

  private readonly http: HttpPort;
  private readonly baseUrl: string;
  private readonly now: () => Date;

  constructor(http: HttpPort, baseUrl: string = GdeltAdapter.BASE_URL, now: () => Date = () => new Date()) {
    this.http = http;
    this.baseUrl = baseUrl;
    this.now = now;
  }

  async fetchTables(request: ProviderRequest): Promise<ProviderResult> {
    const term = request.ticker.replace(/_/gu, " ");
    const window = GdeltAdapter.searchWindow(request.period, this.now());
    if (window === undefined) {
      const from = request.period?.from ?? "";
      const to = request.period?.to ?? "";
      throw new Error(`GDELT's DOC 2.0 API searches the last ${WINDOW_MONTHS} months only; the period ${from} to ${to} is outside it, and no row was written`);
    }
    const query = term.includes(" ") ? `"${term}"` : term;
    const params = new URLSearchParams({
      query,
      mode: "artlist",
      format: "json",
      maxrecords: String(MAX_RECORDS),
      startdatetime: GdeltAdapter.buildTimeStamp(window.from, "start"),
      enddatetime: GdeltAdapter.buildTimeStamp(window.to, "end"),
    });
    const text = await this.readText(`${this.baseUrl}${DOC_PATH}?${params.toString()}`);
    const assetId = AssetIdUtil.build({
      market: request.market,
      assetType: "news",
      code: request.ticker,
    });
    const rows = GdeltAdapter.buildRows(text, assetId);
    return {
      source: GdeltAdapter.VENDOR,
      tables: { asset_news: rows },
      ...(window.isClamped ? { itemErrors: [`GDELT searches the last ${WINDOW_MONTHS} months only; the rows before ${window.from} are not available`] } : {}),
    };
  }

  private async readText(url: string): Promise<string> {
    try {
      return await this.http.getText(url);
    } catch (error) {
      // Why: GDELT asks for one request every five seconds; a refused request names the limit, so the load fails with the reason and writes nothing.
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes(RATE_LIMITED)) {
        throw new Error(
          "GDELT is rate-limiting this server (one request every five seconds); try the load again in a few seconds; no row was written",
          { cause: error },
        );
      }
      throw error;
    }
  }

  static searchWindow(period: PeriodWindow | undefined, now: Date): GdeltSearchWindow | undefined {
    const today = now.toISOString().slice(0, ISO_DAY_LENGTH);
    const earliest = new Date(now);
    earliest.setUTCMonth(earliest.getUTCMonth() - WINDOW_MONTHS);
    const earliestDay = earliest.toISOString().slice(0, ISO_DAY_LENGTH);
    const from = period?.from.slice(0, ISO_DAY_LENGTH) ?? earliestDay;
    const to = period === undefined ? today : period.to.slice(0, ISO_DAY_LENGTH);
    // Why: a period that ends before the window never answers empty; it fails with the window (issue #59, AC25).
    if (to < earliestDay) {
      return undefined;
    }
    const clampedFrom = from < earliestDay ? earliestDay : from;
    const clampedTo = to > today ? today : to;
    return { from: clampedFrom, to: clampedTo, isClamped: clampedFrom !== from };
  }

  static buildTimeStamp(day: string, edge: "start" | "end"): string {
    return `${day.replace(/-/gu, "")}${EDGE_TO_TIME[edge]}`;
  }

  static buildRows(text: string, assetId: string): ProviderRow[] {
    // Why: an answer with no article is an empty body; that is zero rows, not an error.
    if (text.trim() === "") {
      return [];
    }
    const parsed = GdeltArticlesSchema.parse(JSON.parse(text));
    return parsed.articles.map((article) => ({
      asset_id: assetId,
      url: article.url,
      title: article.title ?? null,
      domain: article.domain ?? null,
      language: article.language ?? null,
      source_country: article.sourcecountry ?? null,
      published_time: GdeltAdapter.buildIsoTime(article.seendate),
    }));
  }

  static buildIsoTime(seendate: string): string {
    const match = SEEN_TIME_PATTERN.exec(seendate);
    if (match === null) {
      throw new Error(`the response format changed: ${seendate} is not a GDELT time; no row was written`);
    }
    const [, year, month, day, hour, minute, second] = match;
    return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
  }
}
