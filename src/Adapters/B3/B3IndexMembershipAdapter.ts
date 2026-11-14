import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import type { B3Index, B3IndexPortfolio, IndexMembershipProvider } from "@/Protocols/IndexMembershipProviderProtocol.ts";
import type { ProviderRequest, ProviderResult, ProviderRow } from "@/Protocols/ProviderProtocol.ts";
import { B3IndexPortfolioSchema } from "@/Schemas/B3IndexSchema.ts";
import { AssetIdUtil } from "@/Utils/AssetIdUtil.ts";
import { B3ListingAdapter } from "@/Adapters/B3/B3ListingAdapter.ts";

const PORTFOLIO_ROUTE = "indexProxy/indexCall/GetPortfolioDay";
const INDEX_TO_METRIC: Readonly<Record<B3Index, string>> = {
  ISEE: "index.isee",
  ICO2: "index.ico2",
  GPTW: "index.gptw",
  IDVR: "index.idvr",
};
const PERCENT_UNIT = "percent";
const DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{2})$/u;
const DECIMAL_PATTERN = /^\d+(,\d+)?$/u;

export class B3IndexMembershipAdapter implements IndexMembershipProvider {
  static readonly VENDOR = "b3";
  static readonly INDEXES: readonly B3Index[] = ["ISEE", "ICO2", "GPTW", "IDVR"];

  readonly category = "index_membership";
  readonly vendor = B3IndexMembershipAdapter.VENDOR;
  readonly markets = ["BR"] as const;
  readonly assetTypes = ["stock"] as const;

  private readonly http: HttpPort;
  private readonly baseUrl: string;

  constructor(http: HttpPort, baseUrl: string = B3ListingAdapter.BASE_URL) {
    this.http = http;
    this.baseUrl = baseUrl;
  }

  async fetchTables(request: ProviderRequest): Promise<ProviderResult> {
    const assetId = AssetIdUtil.build({ market: request.market, assetType: "stock", code: request.ticker });
    const rows: ProviderRow[] = [];
    // Why: every index is read before any row is kept; one index that cannot be read fails the load, and nothing is written, so a membership is never reported from part of the indexes.
    for (const index of B3IndexMembershipAdapter.INDEXES) {
      const portfolio = await this.readPortfolio(index);
      const date = B3IndexMembershipAdapter.readDate(portfolio.header.date);
      const entry = (portfolio.results ?? []).find((result) => result.cod === request.ticker);
      if (entry !== undefined) {
        rows.push({
          asset_id: assetId,
          metric: INDEX_TO_METRIC[index],
          reference_time_start: date,
          reference_time_end: date,
          value: B3IndexMembershipAdapter.readPercent(entry.part),
          unit: PERCENT_UNIT,
        });
      }
    }
    return { source: B3IndexMembershipAdapter.VENDOR, tables: { asset_metrics: rows } };
  }

  private async readPortfolio(index: B3Index): Promise<B3IndexPortfolio> {
    const parameter = Buffer.from(JSON.stringify({ index, language: "pt-br" })).toString("base64");
    try {
      const text = await this.http.getText(`${this.baseUrl}/${PORTFOLIO_ROUTE}/${parameter}`);
      return B3IndexPortfolioSchema.parse(JSON.parse(text));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`B3's index ${index} could not be read (${reason}); no row was written`, { cause: error });
    }
  }

  static readDate(text: string): string {
    const match = DATE_PATTERN.exec(text);
    if (match === null) {
      throw new Error(`B3's index date has another format: ${text}`);
    }
    const [, day = "", month = "", year = ""] = match;
    return `20${year}-${month}-${day}`;
  }

  static readPercent(text: string | null): number | null {
    // Why: B3 writes a weight with a decimal comma; a weight that is not a number (for example "-%") is stored as null.
    if (text === null || !DECIMAL_PATTERN.test(text)) {
      return null;
    }
    return Number(text.replace(",", "."));
  }
}
