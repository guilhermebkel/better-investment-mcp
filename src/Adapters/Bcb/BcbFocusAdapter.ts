import { HttpFailureError } from "@/Errors/HttpFailureError.ts";
import type { FocusIndicator } from "@/Protocols/BcbFocusProtocol.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import type { ProviderPort, ProviderRequest, ProviderResult, ProviderRow } from "@/Protocols/ProviderProtocol.ts";
import { BCB_FOCUS_WIRE, BcbFocusResponseSchema } from "@/Schemas/BcbFocusSchema.ts";
import { PeriodService } from "@/Services/PeriodService.ts";
import { AssetIdUtil } from "@/Utils/AssetIdUtil.ts";

const RATE_LIMIT_STATUS = 429;
const MAX_RESPONSE_MIB = 20;
const BYTES_PER_MIB = 1_048_576;
const TIMEOUT_MS = 60_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const REFERENCE_YEAR = /^\d{4}$/u;

// Why: the Focus survey answers the annual expectations; a query names one of these keys, and the service filters on its own name.
const INDICATORS: readonly FocusIndicator[] = [
  { key: "ipca", odataName: "IPCA", code: "IPCA", assetType: "index" },
  { key: "selic", odataName: "Selic", code: "SELIC", assetType: "tax_rate" },
  { key: "pib_total", odataName: "PIB Total", code: "PIB_TOTAL", assetType: "index" },
  { key: "cambio", odataName: "Câmbio", code: "USD", assetType: "currency" },
];

export class BcbFocusAdapter implements ProviderPort<"expectations"> {
  static readonly VENDOR = "bcb";
  static readonly HOST = "olinda.bcb.gov.br";
  static readonly BASE_URL = `https://${BcbFocusAdapter.HOST}/olinda/servico/Expectativas/versao/v1/odata`;
  static readonly MAX_RESPONSE_BYTES = MAX_RESPONSE_MIB * BYTES_PER_MIB;
  static readonly TIMEOUT_MS = TIMEOUT_MS;
  static readonly INDICATORS = INDICATORS;

  readonly category = "expectations";
  readonly vendor = BcbFocusAdapter.VENDOR;
  readonly markets = ["BR"] as const;
  readonly assetTypes = ["index", "tax_rate", "currency"] as const;

  private readonly http: HttpPort;
  private readonly baseUrl: string;

  constructor(http: HttpPort, baseUrl: string = BcbFocusAdapter.BASE_URL) {
    this.http = http;
    this.baseUrl = baseUrl;
  }

  async fetchTables(request: ProviderRequest): Promise<ProviderResult> {
    const indicator = INDICATORS.find(
      (candidate) => candidate.code === request.ticker && candidate.assetType === request.assetType,
    );
    if (indicator === undefined) {
      const known = INDICATORS.map((candidate) => candidate.code).join(", ");
      throw new Error(`unknown Focus indicator ${request.ticker}; the known indicators are ${known}`);
    }
    const filter = encodeURIComponent(`Indicador eq '${indicator.odataName}'`);
    const url = `${this.baseUrl}/ExpectativasMercadoAnuais?$filter=${filter}&$format=json`;
    const text = await this.fetchText(url, indicator.key);
    // Why: the survey answers every year it has; only the reference years of the requested period are returned.
    const rows = BcbFocusAdapter.parseIndicator(text, indicator).filter(
      (row) => request.period === undefined || PeriodService.isWithin(request.period, String(row.reference_time_start)),
    );
    return { source: BcbFocusAdapter.VENDOR, tables: { asset_expectations: rows } };
  }

  static parseIndicator(text: string, indicator: FocusIndicator): ProviderRow[] {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (error) {
      const reason = `the response format changed: the Focus service did not send JSON for ${indicator.key}; no row was written`;
      throw new Error(reason, { cause: error });
    }
    const parsed = BcbFocusResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(`the response format changed: the Focus service sent an unknown shape for ${indicator.key}; no row was written`);
    }
    const seen = new Set<string>();
    return parsed.data[BCB_FOCUS_WIRE.value].map((entry) => {
      if (entry[BCB_FOCUS_WIRE.indicator] !== indicator.odataName) {
        const sent = entry[BCB_FOCUS_WIRE.indicator];
        throw new Error(`the response format changed: the Focus service sent ${sent} for ${indicator.key}; no row was written`);
      }
      // Why: a detail (IndicadorDetalhe) is not a column of this table; a row that carries one is refused, not stored without it.
      if (entry[BCB_FOCUS_WIRE.detail] !== null) {
        throw new Error(`the response format changed: the Focus service sent a detail for ${indicator.key}; no row was written`);
      }
      const surveyDate = entry[BCB_FOCUS_WIRE.surveyDate];
      const referenceYear = entry[BCB_FOCUS_WIRE.referenceYear];
      if (!ISO_DATE.test(surveyDate) || !REFERENCE_YEAR.test(referenceYear)) {
        throw new Error(`the response format changed: the Focus dates ${surveyDate} and ${referenceYear} are not as expected; no row was written`);
      }
      const base = entry[BCB_FOCUS_WIRE.calculationBase];
      const key = `${referenceYear}|${surveyDate}|${base}`;
      if (seen.has(key)) {
        throw new Error(`the response format changed: the Focus service sent two rows for ${indicator.key} with the key ${key}; no row was written`);
      }
      seen.add(key);
      return {
        asset_id: AssetIdUtil.build({ market: "BR", assetType: indicator.assetType, code: indicator.code }),
        reference_time_start: `${referenceYear}-01-01`,
        reference_time_end: `${referenceYear}-12-31`,
        survey_time: surveyDate,
        calculation_base: base,
        mean: entry[BCB_FOCUS_WIRE.mean],
        median: entry[BCB_FOCUS_WIRE.median],
        std_dev: entry[BCB_FOCUS_WIRE.stdDev],
        min: entry[BCB_FOCUS_WIRE.min],
        max: entry[BCB_FOCUS_WIRE.max],
        respondents: entry[BCB_FOCUS_WIRE.respondents],
      };
    });
  }

  private async fetchText(url: string, key: string): Promise<string> {
    try {
      return await this.http.getText(url);
    } catch (error) {
      if (error instanceof HttpFailureError && error.status === RATE_LIMIT_STATUS) {
        const reason = `the Focus service answered with a rate limit for ${key}; the run is recorded and the next load retries`;
        throw new Error(reason, { cause: error });
      }
      throw error;
    }
  }
}
