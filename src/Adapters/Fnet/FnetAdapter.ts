import { createHash } from "node:crypto";
import type { FnetDocumentItem, FnetFilingKind, FnetSearchResponse, LegalIdLookup } from "@/Protocols/FnetProtocol.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import type { ProviderPort, ProviderRequest, ProviderResult, ProviderRow } from "@/Protocols/ProviderProtocol.ts";
import { FnetSearchResponseSchema } from "@/Schemas/FnetSchema.ts";

const BYTES_PER_MIB = 1_048_576;
const MAX_FILE_MIB = 5;
const FILING_ID_LENGTH = 32;
const CNPJ_LENGTH = 14;
const NON_DIGITS = /\D/gu;
const DATE_MATCH = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/u;
const DIACRITICS = /[\u0300-\u036f]/gu;
const FILING_KIND: FnetFilingKind = "fii_management_report";

export class FnetAdapter implements ProviderPort<"filings"> {
  static readonly VENDOR = "fnet";
  static readonly HOST = "fnet.bmfbovespa.com.br";
  static readonly BASE_URL = `https://${FnetAdapter.HOST}`;
  static readonly MAX_FILE_BYTES = MAX_FILE_MIB * BYTES_PER_MIB;
  static readonly MARKETS: readonly "BR"[] = ["BR"];
  static readonly ASSET_TYPES: readonly "fii"[] = ["fii"];
  static readonly PAGE_SIZE = 100;
  static readonly MAX_PAGES = 50;

  readonly category = "filings";
  readonly vendor = FnetAdapter.VENDOR;
  readonly markets = FnetAdapter.MARKETS;
  readonly assetTypes = FnetAdapter.ASSET_TYPES;

  private readonly http: HttpPort;
  private readonly lookup: LegalIdLookup;
  private readonly baseUrl: string;

  constructor(http: HttpPort, lookup: LegalIdLookup, baseUrl: string = FnetAdapter.BASE_URL) {
    this.http = http;
    this.lookup = lookup;
    this.baseUrl = baseUrl;
  }

  async fetchTables(request: ProviderRequest): Promise<ProviderResult> {
    if (request.market !== "BR") {
      throw new Error(`FNET only serves the BR market; ${request.market} is not supported`);
    }
    if (request.assetType !== "fii") {
      throw new Error(`FNET only serves fii assets; ${request.assetType ?? "undefined"} is not supported`);
    }
    const cnpj = await this.lookup(request.market, request.ticker);
    if (cnpj === undefined || cnpj.trim() === "") {
      throw new Error(FnetAdapter.buildUnmappedMessage(request.market, request.ticker));
    }
    const digits = FnetAdapter.readDigits(cnpj);
    if (digits.length !== CNPJ_LENGTH) {
      throw new Error(FnetAdapter.buildInvalidCnpjMessage(request.market, request.ticker, cnpj));
    }
    const filingIdToRow = new Map<string, ProviderRow>();
    let offset = 0;
    let recordsTotal = Number.POSITIVE_INFINITY;
    let pageCount = 0;

    while (offset < recordsTotal && pageCount < FnetAdapter.MAX_PAGES) {
      const response = await this.fetchPage(digits, offset, request.ticker);
      recordsTotal = response.recordsTotal;
      if (response.data.length === 0) {
        break;
      }
      for (const item of response.data) {
        if (!FnetAdapter.isManagerialReport(item.tipoDocumento)) {
          continue;
        }
        const row = FnetAdapter.buildRow(item, request.market, request.ticker);
        filingIdToRow.set(String(row.filing_id), row);
      }
      offset += response.data.length;
      pageCount += 1;
    }

    return { source: FnetAdapter.VENDOR, tables: { filings: [...filingIdToRow.values()] } };
  }

  private async fetchPage(digits: string, offset: number, ticker: string): Promise<FnetSearchResponse> {
    const params = new URLSearchParams({
      "d": "1",
      "s": String(offset),
      "l": String(FnetAdapter.PAGE_SIZE),
      "tipoFundo": "1",
      "cnpjFundo": digits,
      "o[0][dataEntrega]": "desc",
    });
    const url = `${this.baseUrl}/fnet/publico/pesquisarGerenciadorDocumentosDados?${params.toString()}`;
    const text = await this.http.getText(url);
    return FnetAdapter.parseSearchResponse(text, ticker);
  }

  static buildRow(
    item: FnetDocumentItem,
    market: string,
    ticker: string,
  ): ProviderRow {
    const identity = [FnetAdapter.VENDOR, String(item.id), String(item.versao)].join("|");
    const filingId = createHash("sha256").update(identity).digest("hex").slice(0, FILING_ID_LENGTH);
    const deliveredAt = FnetAdapter.parseDeliveredAt(item.dataEntrega);
    const rawCategory = item.categoriaDocumento?.trim();
    const category = rawCategory !== undefined && rawCategory !== "" ? rawCategory : "Relatórios";
    const subject = item.descricaoFundo?.trim() ?? null;
    const url = `https://${FnetAdapter.HOST}/fnet/publico/exibirDocumento?id=${item.id}&cvm=true`;

    return {
      filing_id: filingId,
      market: market,
      ticker: ticker,
      asset_type: "fii",
      filing_type: FILING_KIND,
      category: category,
      delivered_at: deliveredAt,
      subject: subject,
      url: url,
      file_hash: null,
      source: FnetAdapter.VENDOR,
    };
  }

  static parseSearchResponse(text: string, ticker: string): FnetSearchResponse {
    if (text.trim() === "") {
      throw new Error(`FNET answered ${ticker} with an empty body; no row was written`);
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (error) {
      throw new Error(`the response format changed: FNET did not send JSON for ${ticker}; no row was written`, { cause: error });
    }
    const parsed = FnetSearchResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(`the response format changed: FNET sent an error or an unknown shape for ${ticker}; no row was written`);
    }
    return parsed.data;
  }

  static isManagerialReport(tipoDocumento: string | null | undefined): boolean {
    if (!tipoDocumento) {
      return false;
    }
    const normalized = tipoDocumento
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(DIACRITICS, "");
    return normalized === "relatorio gerencial";
  }

  static parseDeliveredAt(dateText: string | null | undefined): string | null {
    if (!dateText) {
      return null;
    }
    const match = DATE_MATCH.exec(dateText.trim());
    if (!match) {
      return null;
    }
    const [, day, month, year, hour = "00", minute = "00", second = "00"] = match;
    return `${year}-${month}-${day}T${hour}:${minute}:${second}-03:00`;
  }

  static readDigits(cnpj: string): string {
    return cnpj.replace(NON_DIGITS, "");
  }

  static buildUnmappedMessage(market: string, ticker: string): string {
    return `cannot map ${market}:${ticker} to a FNET fund; no CNPJ is known for it`;
  }

  static buildInvalidCnpjMessage(market: string, ticker: string, cnpj: string): string {
    return `cannot query FNET for ${market}:${ticker}; "${cnpj}" is not a valid 14-digit CNPJ`;
  }
}
