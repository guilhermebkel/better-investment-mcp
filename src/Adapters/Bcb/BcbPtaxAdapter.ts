import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import type { ProviderPort, ProviderRequest, ProviderResult, ProviderRow } from "@/Protocols/ProviderProtocol.ts";
import { BcbPtaxSchema } from "@/Schemas/BcbPtaxSchema.ts";

const YEARS_BACK = 2;
const CLOSING_BULLETIN = "Fechamento";
const CURRENCY_PATTERN = /^[A-Z]{3}$/u;
const DATE_LENGTH = 10;

export class BcbPtaxAdapter implements ProviderPort<"fx"> {
  static readonly VENDOR = "bcb";
  static readonly HOST = "olinda.bcb.gov.br";
  static readonly BASE_URL = `https://${BcbPtaxAdapter.HOST}/olinda/servico/PTAX/versao/v1/odata`;

  readonly category = "fx";
  readonly vendor = BcbPtaxAdapter.VENDOR;
  readonly markets = ["FX"] as const;
  readonly assetTypes = [] as const;

  private readonly http: HttpPort;
  private readonly baseUrl: string;
  private readonly currentYear: () => number;

  constructor(
    http: HttpPort,
    baseUrl: string = BcbPtaxAdapter.BASE_URL,
    currentYear: () => number = () => new Date().getUTCFullYear(),
  ) {
    this.http = http;
    this.baseUrl = baseUrl;
    this.currentYear = currentYear;
  }

  async fetchTables(request: ProviderRequest): Promise<ProviderResult> {
    // Why: a currency's rate is read per year, so each year's closing bulletins come from one request; a currency is named by its code, as the PTAX service spells it.
    const currency = request.ticker;
    if (!CURRENCY_PATTERN.test(currency)) {
      throw new Error(`the currency ${currency} is not a three-letter code (USD, EUR)`);
    }
    const rows: ProviderRow[] = [];
    const year = this.currentYear();
    for (let reference = year - YEARS_BACK; reference <= year; reference += 1) {
      rows.push(...await this.fetchYear(currency, reference));
    }
    return { source: BcbPtaxAdapter.VENDOR, tables: { fx_rates: rows } };
  }

  static buildUrl(baseUrl: string, currency: string, year: number): string {
    const from = `01-01-${year}`;
    const to = `12-31-${year}`;
    return `${baseUrl}/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)`
      + `?@moeda='${currency}'&@dataInicial='${from}'&@dataFinalCotacao='${to}'&$format=json`;
  }

  static parseClosing(text: string, currency: string): ProviderRow[] {
    const json: unknown = JSON.parse(text);
    const parsed = BcbPtaxSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(`the response format changed: the PTAX service sent an unknown shape for ${currency}; no row was written`);
    }
    // Why: the service can reissue a day's closing bulletin; the later one (by its time) is the rate of that day.
    const dateToBulletin = new Map<string, { time: string; buy: number | null; sell: number | null }>();
    for (const bulletin of parsed.data.value) {
      if (bulletin.tipoBoletim !== CLOSING_BULLETIN) {
        continue;
      }
      const date = bulletin.dataHoraCotacao.slice(0, DATE_LENGTH);
      const known = dateToBulletin.get(date);
      if (known === undefined || bulletin.dataHoraCotacao > known.time) {
        dateToBulletin.set(date, { time: bulletin.dataHoraCotacao, buy: bulletin.cotacaoCompra, sell: bulletin.cotacaoVenda });
      }
    }
    return [...dateToBulletin].sort(([left], [right]) => left.localeCompare(right)).map(([date, bulletin]) => ({
      currency,
      date,
      buy_rate: bulletin.buy,
      sell_rate: bulletin.sell,
      source: BcbPtaxAdapter.VENDOR,
    }));
  }

  private async fetchYear(currency: string, year: number): Promise<ProviderRow[]> {
    const url = BcbPtaxAdapter.buildUrl(this.baseUrl, currency, year);
    const text = await this.http.getText(url);
    return BcbPtaxAdapter.parseClosing(text, currency);
  }
}
