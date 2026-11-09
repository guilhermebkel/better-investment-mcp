import { HttpFailureError } from "@/Errors/HttpFailureError.ts";
import type { BcbSeriesDefinition, DateWindow } from "@/Protocols/BcbProtocol.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import type { ProviderPort, ProviderRequest, ProviderResult, ProviderRow } from "@/Protocols/ProviderProtocol.ts";
import { BcbSeriesRowsSchema } from "@/Schemas/BcbSchema.ts";
import { PeriodService } from "@/Services/PeriodService.ts";
import { AssetIdUtil } from "@/Utils/AssetIdUtil.ts";

const MS_PER_DAY = 86_400_000;
const RATE_LIMIT_STATUS = 429;
const EARLIEST_YEAR = 1990;
const WINDOW_YEARS = 10;
const DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/u;
const PAD_LENGTH = 2;

export class BcbAdapter implements ProviderPort<"macro"> {
  static readonly VENDOR = "bcb";
  static readonly HOST = "api.bcb.gov.br";
  static readonly BASE_URL = `https://${BcbAdapter.HOST}`;
  // Why: the PTAX rate is a currency rate and comes from the PTAX service (category fx), so it is not read from SGS here.
  static readonly SERIES: readonly BcbSeriesDefinition[] = [
    { name: "IPCA", code: 433, unit: "percent_per_month", assetType: "index" },
    { name: "CDI", code: 12, unit: "percent_per_day", assetType: "tax_rate" },
    { name: "SELIC", code: 432, unit: "percent_per_year", assetType: "tax_rate" },
    { name: "IGPM", code: 189, unit: "percent_per_month", assetType: "index" },
  ];

  readonly category = "macro";
  readonly vendor = BcbAdapter.VENDOR;
  readonly markets = ["BR"] as const;
  readonly assetTypes = ["index", "tax_rate"] as const;

  private readonly http: HttpPort;
  private readonly baseUrl: string;
  private readonly now: () => Date;

  constructor(http: HttpPort, baseUrl: string = BcbAdapter.BASE_URL, now: () => Date = () => new Date()) {
    this.http = http;
    this.baseUrl = baseUrl;
    this.now = now;
  }

  async fetchTables(request: ProviderRequest): Promise<ProviderResult> {
    const definition = BcbAdapter.SERIES.find(
      (candidate) => candidate.name === request.ticker && candidate.assetType === request.assetType,
    );
    if (definition === undefined) {
      const known = BcbAdapter.SERIES.map((candidate) => candidate.name).join(", ");
      throw new Error(`unknown series ${request.ticker}; the known series are ${known}`);
    }
    const dateToValue = new Map<string, number | null>();
    // Why: each window is read in turn and merged by date; a date with two different values stops the load.
    for (const window of BcbAdapter.splitWindows(new Date(Date.UTC(EARLIEST_YEAR, 0, 1)), this.resolveToday())) {
      for (const [date, value] of await this.fetchWindow(definition, window)) {
        const known = dateToValue.get(date);
        if (known !== undefined && known !== value) {
          throw new Error(`the response format changed: ${definition.name} has two values for ${date}; no row was written`);
        }
        dateToValue.set(date, value);
      }
    }
    // Why: the service sends the whole series; only the days of the requested period are returned, so the load does not skip the rest.
    const rows: ProviderRow[] = [...dateToValue.entries()]
      .filter(([date]) => request.period === undefined || PeriodService.isWithin(request.period, date))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, value]) => ({
        asset_id: AssetIdUtil.build({ market: "BR", assetType: definition.assetType, code: definition.name }),
        metric: "macro.value",
        reference_time_start: date,
        reference_time_end: date,
        unit: definition.unit,
        value,
      }));
    return { source: BcbAdapter.VENDOR, tables: { asset_metrics: rows } };
  }

  static splitWindows(from: Date, to: Date): DateWindow[] {
    const windows: DateWindow[] = [];
    let start = from;
    while (start.getTime() <= to.getTime()) {
      // Why: the service answers at most ten years of a daily series per request; windows touch with no gap and no overlap.
      const nextStart = Date.UTC(start.getUTCFullYear() + WINDOW_YEARS, start.getUTCMonth(), start.getUTCDate());
      const lastDay = new Date(nextStart - MS_PER_DAY);
      const end = lastDay.getTime() > to.getTime() ? to : lastDay;
      windows.push({ from: start, to: end });
      start = new Date(end.getTime() + MS_PER_DAY);
    }
    return windows;
  }

  static formatBrazilian(date: Date): string {
    const day = String(date.getUTCDate()).padStart(PAD_LENGTH, "0");
    const month = String(date.getUTCMonth() + 1).padStart(PAD_LENGTH, "0");
    return `${day}/${month}/${date.getUTCFullYear()}`;
  }

  private resolveToday(): Date {
    const now = this.now();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  private async fetchWindow(definition: BcbSeriesDefinition, window: DateWindow): Promise<Map<string, number | null>> {
    const from = BcbAdapter.formatBrazilian(window.from);
    const to = BcbAdapter.formatBrazilian(window.to);
    const series = `${this.baseUrl}/dados/serie/bcdata.sgs.${definition.code}/dados`;
    const url = `${series}?formato=json&dataInicial=${from}&dataFinal=${to}`;
    let text: string;
    try {
      text = await this.http.getText(url);
    } catch (error) {
      if (error instanceof HttpFailureError && error.status === RATE_LIMIT_STATUS) {
        const reason = "BCB answered with a rate limit; the run is recorded and the next load retries";
        throw new Error(reason, { cause: error });
      }
      throw error;
    }
    return BcbAdapter.parseSeries(text, definition.name);
  }

  private static parseSeries(text: string, name: string): Map<string, number | null> {
    if (text.trim() === "") {
      throw new Error(`BCB answered ${name} with an empty body; no row was written`);
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (error) {
      const reason = `the response format changed: BCB did not send JSON for ${name}; no row was written`;
      throw new Error(reason, { cause: error });
    }
    const parsed = BcbSeriesRowsSchema.safeParse(json);
    if (!parsed.success) {
      const reason = `the response format changed: BCB sent an error or an unknown shape for ${name}; no row was written`;
      throw new Error(reason);
    }
    const pairs = parsed.data.map((entry) => {
      return [BcbAdapter.readIsoDate(entry.data), BcbAdapter.readValue(entry.valor, name)] as const;
    });
    return new Map(pairs);
  }

  private static readIsoDate(brazilian: string): string {
    const match = DATE_PATTERN.exec(brazilian);
    if (match === null) {
      throw new Error(`the response format changed: the date ${brazilian} is not dd/mm/yyyy; no row was written`);
    }
    const [, day = "", month = "", year = ""] = match;
    return `${year}-${month}-${day}`;
  }

  private static readValue(text: string, name: string): number | null {
    if (text.trim() === "") {
      return null;
    }
    const value = Number(text);
    if (!Number.isFinite(value)) {
      throw new Error(`the response format changed: ${name} has the value ${text}, which is not a number; no row was written`);
    }
    return value;
  }
}
