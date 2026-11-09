import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import type { B3FundIdentifiers, B3StockIdentifiers, B3TickerListing } from "@/Protocols/B3Protocol.ts";
import type { ProviderPort, ProviderRequest, ProviderResult, ProviderRow } from "@/Protocols/ProviderProtocol.ts";
import {
  B3CompanyDetailSchema,
  B3CompanyListSchema,
  B3FundDetailSchema,
  B3FundListSchema,
} from "@/Schemas/B3Schema.ts";

const CANDIDATE_LIMIT = 5;
const FII_TYPE = "FII" as const;
const PAGE_NUMBER = 1;
const PAGE_SIZE = 20;
const CNPJ_DIGITS = 14;
const CNPJ_ROOT_END = 8;
const CNPJ_BRANCH_START = 8;
const CNPJ_BRANCH_END = 12;
const CNPJ_CHECK_START = 12;
const CNPJ_ROOT_PREFIX_END = 2;
const CNPJ_ROOT_MIDDLE_END = 5;
const EMPTY_ANSWER = "";

export class B3ListingAdapter implements ProviderPort<"identifiers"> {
  static readonly VENDOR = "b3";
  static readonly HOST = "sistemaswebb3-listados.b3.com.br";
  static readonly BASE_URL = `https://${B3ListingAdapter.HOST}`;
  static readonly FUND_LIST = "fundsListedProxy/Search/GetListFunds";
  static readonly FUND_DETAIL = "fundsListedProxy/Search/GetDetailFund";
  static readonly COMPANY_LIST = "listedCompaniesProxy/CompanyCall/GetInitialCompanies";
  static readonly COMPANY_DETAIL = "listedCompaniesProxy/CompanyCall/GetDetail";

  readonly category = "identifiers";
  readonly vendor = B3ListingAdapter.VENDOR;
  readonly markets = ["BR"] as const;
  readonly assetTypes = ["stock", "fii"] as const;

  private readonly http: HttpPort;
  private readonly baseUrl: string;

  constructor(http: HttpPort, baseUrl: string = B3ListingAdapter.BASE_URL) {
    this.http = http;
    this.baseUrl = baseUrl;
  }

  async fetchTables(request: ProviderRequest): Promise<ProviderResult> {
    const ticker = request.ticker.toUpperCase();
    const isFund = request.assetType === "fii";
    const row = isFund ? await this.buildFundRow(ticker) : await this.buildStockRow(ticker);
    if (row === undefined) {
      throw new Error(`B3 has no ${request.assetType ?? "asset"} with the ticker ${request.ticker}; no identifier was written`);
    }
    return { source: B3ListingAdapter.VENDOR, tables: { asset_identifiers: [row] } };
  }

  async findStock(ticker: string): Promise<B3StockIdentifiers | undefined> {
    // Why: a stock is listed by its issuer; the detail whose ticker or other codes include the ticker is the one that holds its ISIN.
    const list = await this.getJson(B3ListingAdapter.COMPANY_LIST, {
      language: "pt-br", pageNumber: PAGE_NUMBER, pageSize: PAGE_SIZE, company: ticker,
    });
    const companies = B3CompanyListSchema.parse(list ?? { results: [] }).results;
    for (const company of companies.slice(0, CANDIDATE_LIMIT)) {
      const answer = await this.getJson(B3ListingAdapter.COMPANY_DETAIL, { codeCVM: company.codeCVM, language: "pt-br" });
      if (answer !== null) {
        const detail = B3CompanyDetailSchema.parse(answer);
        const isinEntry = (detail.otherCodes ?? []).find((entry) => entry.code === ticker);
        if (isinEntry !== undefined && detail.cnpj !== null) {
          return {
            legalId: B3ListingAdapter.formatCnpj(detail.cnpj),
            isin: isinEntry.isin,
            companyName: detail.companyName,
          };
        }
      }
    }
    return undefined;
  }

  async findFund(ticker: string): Promise<B3FundIdentifiers | undefined> {
    // Why: a fund is listed by its short name (the acronym without the number); the detail must list the ticker asked, since a fund can carry more than one.
    const list = await this.getJson(B3ListingAdapter.FUND_LIST, {
      language: "pt-br", typeFund: FII_TYPE, pageNumber: PAGE_NUMBER, pageSize: PAGE_SIZE, keyword: ticker.toLowerCase(),
    });
    const funds = B3FundListSchema.parse(list ?? { results: [] }).results;
    const candidates = funds.filter((fund) => fund.acronym !== null && ticker.startsWith(fund.acronym));
    for (const fund of candidates.slice(0, CANDIDATE_LIMIT)) {
      const answer = await this.getJson(B3ListingAdapter.FUND_DETAIL, {
        language: "pt-br", idFNET: fund.id, typeFund: FII_TYPE, idCEM: fund.acronym,
      });
      if (answer !== null) {
        const detail = B3FundDetailSchema.parse(answer);
        if (detail.cnpj !== null && B3ListingAdapter.isTickerListed(detail, ticker)) {
          return { legalId: B3ListingAdapter.formatCnpj(detail.cnpj), fundName: detail.fundName };
        }
      }
    }
    return undefined;
  }

  static isTickerListed(listing: B3TickerListing, ticker: string): boolean {
    const others = (listing.tradingCodeOthers ?? "").split(",").map((code) => code.trim());
    return listing.tradingCode === ticker || others.includes(ticker);
  }

  static formatCnpj(digits: string): string {
    if (digits.length !== CNPJ_DIGITS) {
      throw new Error(`the response format changed: the B3 CNPJ ${digits} does not have 14 digits`);
    }
    const root = digits.slice(0, CNPJ_ROOT_END);
    const prefix = root.slice(0, CNPJ_ROOT_PREFIX_END);
    const middle = root.slice(CNPJ_ROOT_PREFIX_END, CNPJ_ROOT_MIDDLE_END);
    const suffix = root.slice(CNPJ_ROOT_MIDDLE_END);
    const rootText = `${prefix}.${middle}.${suffix}`;
    const branch = digits.slice(CNPJ_BRANCH_START, CNPJ_BRANCH_END);
    const check = digits.slice(CNPJ_CHECK_START);
    return `${rootText}/${branch}-${check}`;
  }

  private async buildStockRow(ticker: string): Promise<ProviderRow | undefined> {
    const found = await this.findStock(ticker);
    if (found === undefined) {
      return undefined;
    }
    return {
      ticker,
      market: "BR",
      asset_type: "stock",
      legal_id: found.legalId,
      isin: found.isin,
      company_name: found.companyName,
      source: B3ListingAdapter.VENDOR,
    };
  }

  private async buildFundRow(ticker: string): Promise<ProviderRow | undefined> {
    const found = await this.findFund(ticker);
    if (found === undefined) {
      return undefined;
    }
    return {
      ticker,
      market: "BR",
      asset_type: "fii",
      legal_id: found.legalId,
      isin: null,
      company_name: found.fundName,
      source: B3ListingAdapter.VENDOR,
    };
  }

  private async getJson(route: string, payload: Record<string, unknown>): Promise<unknown> {
    // Why: an empty body is an answer with nothing in it (no such listing or detail), so it is read as null, not as an error.
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
    const text = await this.http.getText(`${this.baseUrl}/${route}/${encoded}`);
    if (text.trim() === EMPTY_ANSWER) {
      return null;
    }
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error("the response format changed: the B3 listing did not send JSON; no identifier was written", { cause: error });
    }
  }
}
