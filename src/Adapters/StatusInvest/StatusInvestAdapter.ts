import type { z } from "zod";
import { HttpFailureError } from "@/Errors/HttpFailureError.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import type {
  FiiCashField,
  FiiExpenseField,
  FiiRentField,
  FundCategory,
  Pause,
  StatusInvestKey,
} from "@/Protocols/StatusInvestProtocol.ts";
import type { ProviderPort, ProviderRequest, ProviderResult, ProviderRow, TableToRows } from "@/Protocols/ProviderProtocol.ts";
import { IndicatorHistoricalSchema, MonthlySectionSchema, ProventsSchema } from "@/Schemas/StatusInvestSchema.ts";

const FORBIDDEN_STATUS = 403;
const NOT_FOUND_STATUS = 404;
const RATE_LIMIT_STATUS = 429;
const BLOCKED_STATUSES: readonly number[] = [FORBIDDEN_STATUS, RATE_LIMIT_STATUS];
const PAD_LENGTH = 2;
const PAUSE_MS = 1000;
const INDICATOR_YEARS = "5";
const BRAZILIAN_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/u;

export class StatusInvestAdapter<Category extends FundCategory> implements ProviderPort<Category> {
  static readonly VENDOR = "statusinvest";
  static readonly HOST = "statusinvest.com.br";
  static readonly BASE_URL = `https://${StatusInvestAdapter.HOST}`;
  static readonly MARKETS: readonly "BR"[] = ["BR"];

  static readonly CATEGORY_TO_ASSET_TYPES: Readonly<Record<FundCategory, readonly string[]>> = {
    fundamentals: ["stock"],
    fund_data: ["fii"],
  };

  static readonly RENT_FIELD_TO_COLUMN: Readonly<Record<FiiRentField, string>> = {
    receitalaluguel: "rental_revenue",
    receitavendaimovel: "property_sales_revenue",
    receitaoutras: "other_revenue",
    receitatotal: "total_revenue",
  };

  static readonly EXPENSE_FIELD_TO_COLUMN: Readonly<Record<FiiExpenseField, string>> = {
    rendimentosdistribuir: "distributable_income",
    taxaadministracao: "management_fee",
    taxaperformance: "performance_fee",
    aquisicoesimoveis: "property_acquisitions",
    outrasdespesas: "other_expenses",
    totaldespesas: "total_expenses",
  };

  static readonly CASH_FIELD_TO_COLUMN: Readonly<Record<FiiCashField, string>> = {
    totalnecessidadeliquidez: "liquidity_requirement",
    disponibilidades: "cash_available",
    titulospublicos: "government_bonds",
    titulosprivados: "corporate_bonds",
    fundosrendafixa: "fixed_income_funds",
  };

  readonly category: Category;
  readonly vendor = StatusInvestAdapter.VENDOR;
  readonly markets = StatusInvestAdapter.MARKETS;
  readonly assetTypes: readonly string[];

  private readonly http: HttpPort;
  private readonly pause: Pause;
  private readonly pauseMs: number;
  private readonly baseUrl: string;

  constructor(
    category: Category,
    http: HttpPort,
    options: {
      pause?: Pause;
      pauseMs?: number;
      baseUrl?: string;
    } = {},
  ) {
    this.category = category;
    this.assetTypes = StatusInvestAdapter.CATEGORY_TO_ASSET_TYPES[category];
    this.http = http;
    // Why: the Gbkel MCP flows make about nine calls per asset; this adapter waits between calls and never makes them faster.
    this.pause = options.pause ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.pauseMs = options.pauseMs ?? PAUSE_MS;
    this.baseUrl = options.baseUrl ?? StatusInvestAdapter.BASE_URL;
  }

  async fetchTables(request: ProviderRequest): Promise<ProviderResult> {
    if (this.category === "fundamentals") {
      return { source: StatusInvestAdapter.VENDOR, tables: await this.fetchFundamentals(request) };
    }
    return { source: StatusInvestAdapter.VENDOR, tables: await this.fetchFiiMonthly(request) };
  }

  private async fetchFundamentals(request: ProviderRequest): Promise<TableToRows> {
    const body = { ticker: request.ticker, time: INDICATOR_YEARS };
    const url = `${this.baseUrl}/acao/indicatorhistorical`;
    const text = await this.callSite(() => this.http.postForm(url, body));
    const parsed = StatusInvestAdapter.parseText(text, IndicatorHistoricalSchema, "indicatorhistorical");
    const rows: ProviderRow[] = parsed.data.flatMap((indicator) => indicator.ranks.map((rank) => ({
      market: request.market,
      ticker: request.ticker,
      asset_type: "stock",
      year: rank.rank,
      metric: indicator.key,
      value: StatusInvestAdapter.readNumber(Reflect.get(rank, "value_F"), "value_F"),
      source: StatusInvestAdapter.VENDOR,
    })));
    return { fundamentals: rows };
  }

  private async fetchFiiMonthly(request: ProviderRequest): Promise<TableToRows> {
    const key: StatusInvestKey = { market: request.market, ticker: request.ticker, asset_type: "fii" };
    const periodToRow = new Map<string, ProviderRow>();
    const ticker = encodeURIComponent(request.ticker);

    const proventsUrl = `${this.baseUrl}/fii/companytickerprovents?ticker=${ticker}&chartProventsType=1`;
    const provents = StatusInvestAdapter.parseText(
      await this.callSite(() => this.http.getText(proventsUrl)),
      ProventsSchema,
      "companytickerprovents",
    );
    for (const event of provents.assetEarningsModels) {
      const period = StatusInvestAdapter.readPeriod(event.pd);
      const row = StatusInvestAdapter.resolveMonthRow(periodToRow, key, period);
      row.distribution_per_unit = Number(row.distribution_per_unit ?? 0) + event.v;
    }

    const sections = [
      await this.fetchSection("getreceitas", ticker, StatusInvestAdapter.RENT_FIELD_TO_COLUMN),
      await this.fetchSection("getdespesas", ticker, StatusInvestAdapter.EXPENSE_FIELD_TO_COLUMN),
      await this.fetchSection("getcaixa", ticker, StatusInvestAdapter.CASH_FIELD_TO_COLUMN),
    ];
    for (const section of sections) {
      for (const [period, values] of section) {
        const row = StatusInvestAdapter.resolveMonthRow(periodToRow, key, period);
        Object.assign(row, values);
      }
    }

    const rows = [...periodToRow.values()].sort((left, right) => StatusInvestAdapter.comparePeriods(left, right));
    return { fii_monthly: rows };
  }

  private async fetchSection(
    endpoint: string,
    ticker: string,
    fieldToColumn: Readonly<Record<string, string>>,
  ): Promise<Map<string, ProviderRow>> {
    const url = `${this.baseUrl}/fii/${endpoint}?code=${ticker}&type=0`;
    const text = await this.callSite(() => this.http.getText(url));
    const parsed = StatusInvestAdapter.parseText(text, MonthlySectionSchema, endpoint);
    const periodToValues = new Map<string, ProviderRow>();
    for (const month of parsed.listMonth) {
      const values: ProviderRow = {};
      for (const [field, column] of Object.entries(fieldToColumn)) {
        if (!Object.hasOwn(month, field)) {
          throw new Error(`the response format changed: ${endpoint} has no field ${field}; no row was written`);
        }
        values[column] = StatusInvestAdapter.readNumber(month[field], field);
      }
      periodToValues.set(StatusInvestAdapter.readMonthPeriod(month, endpoint), values);
    }
    return periodToValues;
  }

  private async callSite(send: () => Promise<string>): Promise<string> {
    await this.pause(this.pauseMs);
    try {
      return await send();
    } catch (error) {
      if (error instanceof HttpFailureError && error.status !== undefined && BLOCKED_STATUSES.includes(error.status)) {
        const reason = `StatusInvest blocks this client (status ${error.status}); the run is recorded and no row was written`;
        throw new Error(reason, { cause: error });
      }
      if (error instanceof HttpFailureError && error.status === NOT_FOUND_STATUS) {
        throw new Error("StatusInvest did not find the asset; no row was written", { cause: error });
      }
      throw error;
    }
  }

  private static comparePeriods(left: ProviderRow, right: ProviderRow): number {
    return String(left.period).localeCompare(String(right.period));
  }

  private static resolveMonthRow(
    periodToRow: Map<string, ProviderRow>,
    key: StatusInvestKey,
    period: string,
  ): ProviderRow {
    const existing = periodToRow.get(period);
    if (existing !== undefined) {
      return existing;
    }
    const created: ProviderRow = { ...key, period, net_worth: null, source: StatusInvestAdapter.VENDOR };
    periodToRow.set(period, created);
    return created;
  }

  private static parseText<T>(text: string, schema: z.ZodType<T>, endpoint: string): T {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (error) {
      const reason = `the response format changed: StatusInvest did not send JSON for ${endpoint}; no row was written`;
      throw new Error(reason, { cause: error });
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new Error(`the response format changed: the ${endpoint} shape is not the one the adapter reads; no row was written`);
    }
    return parsed.data;
  }

  private static readPeriod(brazilian: string): string {
    const match = BRAZILIAN_DATE.exec(brazilian);
    if (match === null) {
      throw new Error(`the response format changed: the date ${brazilian} is not dd/mm/yyyy; no row was written`);
    }
    const [, , month = "", year = ""] = match;
    return `${year}-${month}-01`;
  }

  private static readMonthPeriod(month: Readonly<Record<string, unknown>>, endpoint: string): string {
    const year = Number(month.year);
    const monthNumber = Number(month.month);
    if (!Number.isInteger(year) || !Number.isInteger(monthNumber)) {
      throw new Error(`the response format changed: ${endpoint} has no month and year; no row was written`);
    }
    return `${year}-${String(monthNumber).padStart(PAD_LENGTH, "0")}-01`;
  }

  private static readNumber(value: unknown, field: string): number | null {
    // Why: the site formats amounts as text for display ("R$ 1.234,56"); the adapter takes numbers only and never parses the formatted text.
    if (value === null) {
      return null;
    }
    if (typeof value !== "number") {
      throw new Error(`the response format changed: the field ${field} is not a number; no row was written`);
    }
    return value;
  }
}
