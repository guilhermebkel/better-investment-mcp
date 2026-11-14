import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import type { ProviderRequest, ProviderResult, ProviderRow } from "@/Protocols/ProviderProtocol.ts";
import type { SectorProvider } from "@/Protocols/SectorProviderProtocol.ts";
import { IbgeSidraResponseSchema, IbgeSidraValueSchema, type IbgeSidraColumnToText } from "@/Schemas/IbgeSidraSchema.ts";
import { AssetIdUtil } from "@/Utils/AssetIdUtil.ts";

const COMPANIES_TABLE = "6449";
const COMPANIES_VARIABLE = "2585";
// Why: the CNAE 2.0 classification of the Cadastro Central de Empresas tables, checked against the live values route on 2026-11-14.
const CNAE_CLASSIFICATION = "12762";
const COMPANIES_METRIC = "sector.companies";
const COMPANIES_UNIT = "count";
const LATEST_YEAR_QUERY = "p/last%201";
const ALL_YEARS_QUERY = "p/all";
const ALL_CATEGORIES = "all";

export class IbgeSectorAdapter implements SectorProvider {
  static readonly VENDOR = "ibge";
  static readonly HOST = "apisidra.ibge.gov.br";
  static readonly BASE_URL = `https://${IbgeSectorAdapter.HOST}`;

  readonly category = "sector";
  readonly vendor = IbgeSectorAdapter.VENDOR;
  readonly markets = ["BR"] as const;
  readonly assetTypes = ["sector"] as const;

  private readonly http: HttpPort;
  private readonly baseUrl: string;

  constructor(http: HttpPort, baseUrl: string = IbgeSectorAdapter.BASE_URL) {
    this.http = http;
    this.baseUrl = baseUrl;
  }

  async fetchTables(request: ProviderRequest): Promise<ProviderResult> {
    const code = request.ticker;
    // Why: the table names a category by its code at the start of the name, not by an id that matches the CNAE code; the id is found in the latest year, then the history of that id is read.
    const latest = await this.readValues(LATEST_YEAR_QUERY, ALL_CATEGORIES);
    const categoryId = IbgeSectorAdapter.findCategoryId(latest, code);
    if (categoryId === undefined) {
      throw new Error(`IBGE's table ${COMPANIES_TABLE} has no CNAE category ${code}; no row was written`);
    }
    const history = await this.readValues(ALL_YEARS_QUERY, categoryId);
    const assetId = AssetIdUtil.build({ market: request.market, assetType: "sector", code });
    const rows: ProviderRow[] = history
      .filter((value) => value.D2C === COMPANIES_VARIABLE && value.D4C === categoryId)
      .map((value) => ({
        asset_id: assetId,
        metric: COMPANIES_METRIC,
        reference_time_start: `${value.D3C ?? ""}-01-01`,
        reference_time_end: `${value.D3C ?? ""}-12-31`,
        value: IbgeSectorAdapter.readCount(value.V ?? ""),
        unit: COMPANIES_UNIT,
      }));
    return { source: IbgeSectorAdapter.VENDOR, tables: { asset_metrics: rows } };
  }

  private async readValues(period: string, categories: string): Promise<IbgeSidraColumnToText[]> {
    const url = `${this.baseUrl}/values/t/${COMPANIES_TABLE}/n1/1/v/${COMPANIES_VARIABLE}/${period}/c${CNAE_CLASSIFICATION}/${categories}`;
    const parsed = IbgeSidraResponseSchema.parse(JSON.parse(await this.http.getText(url)));
    // Why: the first item names the columns and holds no value; each following item must have the shape of a value, or the load stops.
    return parsed.slice(1).map((item) => IbgeSidraValueSchema.parse(item));
  }

  static findCategoryId(values: readonly IbgeSidraColumnToText[], code: string): string | undefined {
    return values.find((value) => value.D2C === COMPANIES_VARIABLE && (value.D4N ?? "").startsWith(`${code} `))?.D4C;
  }

  static readCount(text: string): number | null {
    // Why: IBGE writes a missing value as "..." or "-", which is stored as null, not as zero.
    const value = Number(text);
    return text.trim() === "" || Number.isNaN(value) ? null : value;
  }
}
