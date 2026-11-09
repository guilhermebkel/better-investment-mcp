import { join } from "node:path";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import type { ProviderPort, ProviderRequest, ProviderResult, ProviderRow } from "@/Protocols/ProviderProtocol.ts";
import { CvmUtil } from "@/Utils/CvmUtil.ts";
import { TempFileUtil } from "@/Utils/TempFileUtil.ts";
import { ZipFileUtil } from "@/Utils/ZipFileUtil.ts";
import { HttpFailureError } from "@/Errors/HttpFailureError.ts";
import type { CotahistField } from "@/Protocols/B3Protocol.ts";
import { QualityFlagService } from "@/Services/QualityFlagService.ts";

const BYTES_PER_MIB = 1_048_576;
const MAX_FILE_MIB = 150;
const TIMEOUT_MS = 900_000;
const YEARS_BACK = 1;
const YEAR_END = 4;
const MONTH_END = 6;
const RECORD_TYPE_QUOTE = "01";
const MARKET_SPOT = "010";
const FACTOR_UNIT = "0000001";
const PRICE_DIVISOR = 100;
const LINE_BREAK = "\r";
const NOT_FOUND_STATUS = 404;
const TEXT_SUFFIX = ".TXT";

// Why: the record layout is fixed-width, 245 bytes; these are the 1-based positions of the B3 manual, read here as 0-based [start, end) slices.
const RECORD_TYPE_START = 0;
const RECORD_TYPE_END = 2;
const RECORD_TYPE_FIELD: CotahistField = [RECORD_TYPE_START, RECORD_TYPE_END];
const DATE_START = 2;
const DATE_END = 10;
const DATE_FIELD: CotahistField = [DATE_START, DATE_END];
const TICKER_START = 12;
const TICKER_END = 24;
const TICKER_FIELD: CotahistField = [TICKER_START, TICKER_END];
const MARKET_TYPE_START = 24;
const MARKET_TYPE_END = 27;
const MARKET_TYPE_FIELD: CotahistField = [MARKET_TYPE_START, MARKET_TYPE_END];
const OPEN_START = 56;
const OPEN_END = 69;
const OPEN_FIELD: CotahistField = [OPEN_START, OPEN_END];
const HIGH_START = 69;
const HIGH_END = 82;
const HIGH_FIELD: CotahistField = [HIGH_START, HIGH_END];
const LOW_START = 82;
const LOW_END = 95;
const LOW_FIELD: CotahistField = [LOW_START, LOW_END];
const CLOSE_START = 108;
const CLOSE_END = 121;
const CLOSE_FIELD: CotahistField = [CLOSE_START, CLOSE_END];
const QUANTITY_START = 152;
const QUANTITY_END = 170;
const QUANTITY_FIELD: CotahistField = [QUANTITY_START, QUANTITY_END];
const FACTOR_START = 210;
const FACTOR_END = 217;
const FACTOR_FIELD: CotahistField = [FACTOR_START, FACTOR_END];

export class B3CotahistAdapter implements ProviderPort<"quotes"> {
  static readonly VENDOR = "b3";
  static readonly HOST = "bvmf.bmfbovespa.com.br";
  static readonly BASE_URL = `https://${B3CotahistAdapter.HOST}`;
  static readonly MAX_FILE_BYTES = MAX_FILE_MIB * BYTES_PER_MIB;
  static readonly TIMEOUT_MS = TIMEOUT_MS;

  readonly category = "quotes";
  readonly vendor = B3CotahistAdapter.VENDOR;
  readonly markets = ["BR"] as const;
  readonly assetTypes = ["stock", "fii"] as const;

  private readonly http: HttpPort;
  private readonly baseUrl: string;
  private readonly currentYear: () => number;

  constructor(
    http: HttpPort,
    baseUrl: string = B3CotahistAdapter.BASE_URL,
    currentYear: () => number = () => new Date().getUTCFullYear(),
  ) {
    this.http = http;
    this.baseUrl = baseUrl;
    this.currentYear = currentYear;
  }

  async fetchTables(request: ProviderRequest): Promise<ProviderResult> {
    const rows: ProviderRow[] = [];
    const year = this.currentYear();
    // Why: the file of each year is about 90 MB, so a query loads the current year and the one before, and no more; a longer history is not read here.
    for (let reference = year - YEARS_BACK; reference <= year; reference += 1) {
      rows.push(...await this.readYear(reference, request));
    }
    rows.sort((left, right) => String(left.date).localeCompare(String(right.date)));
    const points = rows.map((row) => ({ close: Number(row.close), volume: Number(row.volume) }));
    const flags = QualityFlagService.buildFlags(points);
    const flagged = rows.map((row, index) => ({
      ...row,
      is_stale: flags[index]?.isStale ?? false,
      suspect_tick: flags[index]?.isSuspectTick ?? false,
    }));
    return { source: B3CotahistAdapter.VENDOR, tables: { quotes: flagged } };
  }

  static buildUrl(baseUrl: string, year: number): string {
    return `${baseUrl}/InstDados/SerHist/COTAHIST_A${year}.ZIP`;
  }

  private async readYear(year: number, request: ProviderRequest): Promise<ProviderRow[]> {
    return TempFileUtil.runInTempDir(async (directory) => {
      const zipPath = join(directory, `COTAHIST_A${year}.ZIP`);
      try {
        await this.http.downloadToFile(B3CotahistAdapter.buildUrl(this.baseUrl, year), zipPath);
      } catch (error) {
        // Why: a year with no file yet (or no longer served) has no quotes; it is skipped, as a CVM year without a file is.
        if (error instanceof HttpFailureError && error.status === NOT_FOUND_STATUS) {
          return [];
        }
        throw error;
      }
      const entries = await ZipFileUtil.listEntries(zipPath);
      const [entry] = entries.filter((candidate) => candidate.name.toUpperCase().endsWith(TEXT_SUFFIX));
      if (entry === undefined) {
        throw new Error(`the response format changed: the B3 file for ${year} has no text entry; no row was written`);
      }
      const stream = await ZipFileUtil.openEntry(zipPath, entry.name);
      return B3CotahistAdapter.parseLines(CvmUtil.readLines(stream), request);
    });
  }

  static async parseLines(lines: AsyncIterable<string>, request: ProviderRequest): Promise<ProviderRow[]> {
    const rows: ProviderRow[] = [];
    for await (const line of lines) {
      const row = B3CotahistAdapter.parseQuote(line.replace(LINE_BREAK, ""), request);
      if (row !== undefined) {
        rows.push(row);
      }
    }
    return rows;
  }

  static parseQuote(line: string, request: ProviderRequest): ProviderRow | undefined {
    // Why: only spot-market, unit-factor records of the ticker asked are read; a price in a lot of a thousand (factor 1000) is not divided here, because the file does not say whether its price already includes the factor.
    if (B3CotahistAdapter.read(line, RECORD_TYPE_FIELD) !== RECORD_TYPE_QUOTE) {
      return undefined;
    }
    const ticker = B3CotahistAdapter.read(line, TICKER_FIELD);
    const marketType = B3CotahistAdapter.read(line, MARKET_TYPE_FIELD);
    if (ticker !== request.ticker || marketType !== MARKET_SPOT) {
      return undefined;
    }
    if (B3CotahistAdapter.read(line, FACTOR_FIELD) !== FACTOR_UNIT) {
      return undefined;
    }
    const raw = B3CotahistAdapter.read(line, DATE_FIELD);
    return {
      market: request.market,
      ticker: request.ticker,
      asset_type: request.assetType ?? null,
      date: `${raw.slice(0, YEAR_END)}-${raw.slice(YEAR_END, MONTH_END)}-${raw.slice(MONTH_END)}`,
      open: B3CotahistAdapter.readPrice(line, OPEN_FIELD),
      high: B3CotahistAdapter.readPrice(line, HIGH_FIELD),
      low: B3CotahistAdapter.readPrice(line, LOW_FIELD),
      close: B3CotahistAdapter.readPrice(line, CLOSE_FIELD),
      adj_close: null,
      volume: Number(B3CotahistAdapter.read(line, QUANTITY_FIELD)),
      source: B3CotahistAdapter.VENDOR,
    };
  }

  private static readPrice(line: string, field: CotahistField): number {
    return Number(B3CotahistAdapter.read(line, field)) / PRICE_DIVISOR;
  }

  private static read(line: string, field: CotahistField): string {
    return line.slice(field[0], field[1]).trim();
  }
}
