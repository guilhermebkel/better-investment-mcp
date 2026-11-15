import type { BankingProvider } from "@/Protocols/BankingProviderProtocol.ts";
import type { IfDataAccount, IfDataQuarterEndMonth, IfDataQuarterPeriod, IfDataValue } from "@/Protocols/BcbIfDataProtocol.ts";
import type { LegalIdLookup } from "@/Protocols/CvmProtocol.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import type { ProviderRequest, ProviderResult, ProviderRow } from "@/Protocols/ProviderProtocol.ts";
import { PeriodService } from "@/Services/PeriodService.ts";
import { IfDataCadastroSchema, IfDataValoresSchema } from "@/Schemas/IfDataSchema.ts";
import { AssetIdUtil } from "@/Utils/AssetIdUtil.ts";

const OLINDA_PATH = "/olinda/servico/IFDATA/versao/v1/odata";
// Why: the summary report (Relatorio 2, Ativo) holds the total assets and the credit operations of each group; TipoInstituicao 1 is the prudential conglomerate or the independent institution.
const BALANCE_REPORT = "2";
const GROUP_TYPE = 1;
const TOTAL_ASSETS_ACCOUNT = "140220";
const CREDIT_ACCOUNT = "140205";
const ACCOUNTS: readonly IfDataAccount[] = [
  { account: TOTAL_ASSETS_ACCOUNT, metric: "banking.total_assets" },
  { account: CREDIT_ACCOUNT, metric: "banking.credit_portfolio" },
];
const QUARTER_END_MONTHS: readonly IfDataQuarterEndMonth[] = ["03", "06", "09", "12"];
const QUARTER_END_TO_START_MONTH: Readonly<Record<IfDataQuarterEndMonth, string>> = { "03": "01", "06": "04", "09": "07", "12": "10" };
// Why: the first served quarter is 2013-03; a request before it is answered from there.
const FIRST_SERVED_YEAR_MONTH = "2013-03";
const DEFAULT_YEARS_BACK = 2;
const YEAR_LENGTH = 4;
const YEAR_MONTH_LENGTH = 7;
const CNPJ_ROOT_LENGTH = 8;
const DIGITS = /\D/gu;
const PERCENT_PER_UNIT = 100;
const UNIT_BRL = "brl";
const UNIT_PERCENT = "percent";
const ISO_DAY_LENGTH = 10;

export class BcbIfDataAdapter implements BankingProvider {
  static readonly VENDOR = "bcb";
  static readonly HOST = "olinda.bcb.gov.br";
  static readonly BASE_URL = `https://${BcbIfDataAdapter.HOST}`;

  readonly category = "banking";
  readonly vendor = BcbIfDataAdapter.VENDOR;
  readonly markets = ["BR"] as const;
  readonly assetTypes = ["stock"] as const;

  private readonly http: HttpPort;
  private readonly resolveCnpj: LegalIdLookup;
  private readonly baseUrl: string;
  private readonly now: () => Date;

  constructor(
    http: HttpPort,
    resolveCnpj: LegalIdLookup,
    baseUrl: string = BcbIfDataAdapter.BASE_URL,
    now: () => Date = () => new Date(),
  ) {
    this.http = http;
    this.resolveCnpj = resolveCnpj;
    this.baseUrl = baseUrl;
    this.now = now;
  }

  async fetchTables(request: ProviderRequest): Promise<ProviderResult> {
    const cnpj = await this.resolveCnpj(request.market, request.ticker);
    if (cnpj === undefined) {
      throw new Error(`${request.market}:${request.ticker} has no CNPJ in the CVM company list, so its bank is not known; no row was written`);
    }
    const root = cnpj.replace(DIGITS, "").slice(0, CNPJ_ROOT_LENGTH);
    const assetId = AssetIdUtil.build({ market: request.market, assetType: "stock", code: request.ticker });
    const quarters = this.readQuarters(request);
    const rows: ProviderRow[] = [];
    const itemErrors: string[] = [];
    for (const quarter of quarters) {
      const codes = await this.readGroupCodes(quarter, root);
      if (codes === undefined) {
        itemErrors.push(`${quarter} is not published yet; its values are not stored`);
        continue;
      }
      for (const { account, metric } of ACCOUNTS) {
        const values = await this.readAccount(quarter, account);
        const built = BcbIfDataAdapter.buildRows(assetId, quarter, metric, values, codes);
        rows.push(...built);
      }
    }
    return {
      source: BcbIfDataAdapter.VENDOR,
      tables: { asset_metrics: rows },
      ...(itemErrors.length === 0 ? {} : { itemErrors }),
    };
  }

  private readQuarters(request: ProviderRequest): string[] {
    const today = this.now();
    const fallbackFrom = `${today.getUTCFullYear() - DEFAULT_YEARS_BACK}-01-01`;
    const fallbackTo = today.toISOString().slice(0, ISO_DAY_LENGTH);
    const from = request.period?.from ?? fallbackFrom;
    const to = request.period?.to ?? fallbackTo;
    return BcbIfDataAdapter.readQuarterEnds(from, to);
  }

  private async readGroupCodes(yearMonth: string, root: string): Promise<Set<string> | undefined> {
    const url = BcbIfDataAdapter.buildUrl(this.baseUrl, `IfDataCadastro(AnoMes=${yearMonth})`);
    const text = await this.http.getText(url);
    const parsed = IfDataCadastroSchema.parse(JSON.parse(text));
    if (parsed.value.length === 0) {
      return undefined;
    }
    const codes = parsed.value
      .filter((row) => (row.CnpjInstituicaoLider ?? "") === root)
      .map((row) => row.CodInst);
    return new Set(codes);
  }

  private async readAccount(yearMonth: string, account: string): Promise<IfDataValue[]> {
    const filter = encodeURIComponent(`Conta eq '${account}'`);
    const path = `IfDataValores(AnoMes=${yearMonth},TipoInstituicao=${GROUP_TYPE},Relatorio='${BALANCE_REPORT}')`;
    const url = BcbIfDataAdapter.buildUrl(this.baseUrl, path, `&%24filter=${filter}`);
    const text = await this.http.getText(url);
    const parsed = IfDataValoresSchema.parse(JSON.parse(text));
    return parsed.value.map((row) => ({ codInst: row.CodInst, saldo: row.Saldo }));
  }

  static buildRows(
    assetId: string,
    yearMonth: string,
    metric: string,
    values: readonly IfDataValue[],
    codes: ReadonlySet<string>,
  ): ProviderRow[] {
    const linked = values.filter((row) => codes.has(row.codInst) && row.saldo !== null);
    if (linked.length === 0) {
      return [];
    }
    // Why: the share is computed from the same file and period, over every group the file has, so it is never taken from another source (issue #59, S16).
    const total = values.reduce((sum, row) => sum + (row.saldo ?? 0), 0);
    const amount = linked.reduce((sum, row) => sum + (row.saldo ?? 0), 0);
    const period = BcbIfDataAdapter.readQuarterPeriod(yearMonth);
    const share = total === 0 ? null : (amount / total) * PERCENT_PER_UNIT;
    return [
      { asset_id: assetId, metric, ...period, value: amount, unit: UNIT_BRL },
      { asset_id: assetId, metric: `${metric}_share`, ...period, value: share, unit: UNIT_PERCENT },
    ];
  }

  static readQuarterPeriod(yearMonth: string): IfDataQuarterPeriod {
    const year = yearMonth.slice(0, YEAR_LENGTH);
    const endMonth = yearMonth.slice(YEAR_LENGTH);
    const startMonth = QUARTER_END_TO_START_MONTH[endMonth as IfDataQuarterEndMonth];
    const lastDay = PeriodService.endOfMonth(`${year}-${endMonth}-01`);
    return { reference_time_start: `${year}-${startMonth}-01`, reference_time_end: lastDay };
  }

  static readQuarterEnds(from: string, to: string): string[] {
    const first = from.slice(0, YEAR_MONTH_LENGTH);
    const last = to.slice(0, YEAR_MONTH_LENGTH);
    const earliest = first > FIRST_SERVED_YEAR_MONTH ? first : FIRST_SERVED_YEAR_MONTH;
    const lastYearText = last.slice(0, YEAR_LENGTH);
    const earliestYearText = earliest.slice(0, YEAR_LENGTH);
    const lastYear = Number(lastYearText);
    const quarters: string[] = [];
    for (let year = Number(earliestYearText); year <= lastYear; year += 1) {
      for (const month of QUARTER_END_MONTHS) {
        const yearMonth = `${year}-${month}`;
        if (yearMonth >= earliest && yearMonth <= last) {
          quarters.push(`${year}${month}`);
        }
      }
    }
    return quarters;
  }

  static buildUrl(baseUrl: string, path: string, query = ""): string {
    return `${baseUrl}${OLINDA_PATH}/${path}?%24format=json${query}`;
  }
}
