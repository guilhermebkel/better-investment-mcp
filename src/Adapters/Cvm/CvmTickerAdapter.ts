import { CvmAdapter } from "@/Adapters/Cvm/CvmAdapter.ts";
import type { CvmCompanyColumns, CvmCompanyEntry, CvmFiiTicker, CvmFundEntry, LegalIdLookup } from "@/Protocols/CvmProtocol.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import type { ProviderFile } from "@/Protocols/ProviderProtocol.ts";
import { CvmUtil } from "@/Utils/CvmUtil.ts";
import { ZipFileUtil } from "@/Utils/ZipFileUtil.ts";

const SEPARATOR = ";";
const COMPANY_FILE_PREFIX = "fca_cia_aberta_valor_mobiliario_";
const COLUMN_CNPJ = "CNPJ_Companhia";
const COLUMN_TICKER = "Codigo_Negociacao";
const COLUMN_REFERENCE = "Data_Referencia";
const COMPANY_DATASET = "cia_aberta-fca";
const BR_MARKET = "BR";

// Why: the funds are not in the company registry, and CVM's datasets carry no ticker for a fund; this list holds only the funds whose CNPJ is checked against CVM's own name for it (issue #28, S5).
const FII_TICKER_TO_FUND: Readonly<Record<CvmFiiTicker, CvmFundEntry>> = {
  IRDM11: { cnpj: "28.830.325/0001-10", name: "IRIDIUM REC IMOB FII" },
};

export class CvmTickerAdapter {
  private readonly http: HttpPort;
  private readonly baseUrl: string;
  private readonly currentYear: () => number;
  private readonly fundLookup: (ticker: string) => Promise<string | undefined>;
  private companies?: Promise<ReadonlyMap<string, string>>;

  readonly resolveCnpj: LegalIdLookup = (market, ticker) => this.findCnpj(market, ticker);

  constructor(
    http: HttpPort,
    baseUrl: string = CvmAdapter.BASE_URL,
    currentYear: () => number = () => new Date().getUTCFullYear(),
    fundLookup: (ticker: string) => Promise<string | undefined> = () => Promise.resolve(undefined),
  ) {
    this.http = http;
    this.baseUrl = baseUrl;
    this.currentYear = currentYear;
    this.fundLookup = fundLookup;
  }

  static isUnitTicker(ticker: string): boolean {
    return ticker.endsWith("11");
  }

  static isFiiTicker(ticker: string): ticker is CvmFiiTicker {
    return Object.hasOwn(FII_TICKER_TO_FUND, ticker);
  }

  private async findCnpj(market: string, ticker: string): Promise<string | undefined> {
    if (market !== BR_MARKET) {
      return undefined;
    }
    if (CvmTickerAdapter.isFiiTicker(ticker)) {
      return FII_TICKER_TO_FUND[ticker].cnpj;
    }
    try {
      const companies = await this.readCompanies();
      const company = companies.get(ticker);
      if (company !== undefined || !CvmTickerAdapter.isUnitTicker(ticker)) {
        return company;
      }
      // Why: a fund's ticker (a unit, ending in 11) is not in CVM's company list; B3's listing gives its CNPJ, which is checked against the ticker it lists.
      return await this.fundLookup(ticker);
    } catch (error) {
      throw CvmUtil.classifyFailure(error);
    }
  }

  private readCompanies(): Promise<ReadonlyMap<string, string>> {
    // Why: the company list is read once per process; a failed read is not kept, so the next request reads it again.
    this.companies ??= this.loadCompanies().catch((error: unknown) => {
      this.companies = undefined;
      throw error;
    });
    return this.companies;
  }

  private async loadCompanies(): Promise<ReadonlyMap<string, string>> {
    const tickerToEntry = new Map<string, CvmCompanyEntry>();
    const files: ProviderFile[] = [];
    const year = this.currentYear();
    for (const referenceYear of [year, year - 1]) {
      const url = `${this.baseUrl}/dados/CIA_ABERTA/DOC/FCA/DADOS/fca_cia_aberta_${referenceYear}.zip`;
      const key = { dataset: COMPANY_DATASET, year: referenceYear };
      await CvmUtil.downloadCvmFile(this.http, url, key, files, async (zip) => {
        const lines = CvmUtil.readLines(await ZipFileUtil.openEntry(zip, `${COMPANY_FILE_PREFIX}${referenceYear}.csv`));
        await CvmTickerAdapter.readCompanyLines(lines, tickerToEntry);
      });
    }
    return new Map([...tickerToEntry].map(([ticker, entry]) => [ticker, entry.cnpj] as const));
  }

  static async readCompanyLines(
    lines: AsyncIterable<string>,
    tickerToEntry: Map<string, CvmCompanyEntry>,
  ): Promise<void> {
    let columns: CvmCompanyColumns | undefined;
    for await (const line of lines) {
      if (columns === undefined) {
        columns = CvmTickerAdapter.readColumns(line);
        continue;
      }
      const fields = line.split(SEPARATOR);
      const ticker = fields[columns.ticker]?.trim() ?? "";
      const cnpj = fields[columns.cnpj]?.trim() ?? "";
      const referenceDate = fields[columns.reference]?.trim() ?? "";
      const isListed = ticker !== "" && cnpj !== "";
      // Why: a ticker that appears in two years keeps the company of the later reference date, which is the one CVM holds now.
      const known = tickerToEntry.get(ticker);
      if (isListed && (known === undefined || referenceDate > known.referenceDate)) {
        tickerToEntry.set(ticker, { cnpj, referenceDate });
      }
    }
  }

  private static readColumns(header: string): CvmCompanyColumns {
    const names = header.split(SEPARATOR);
    const indexOf = (column: string): number => {
      const index = names.indexOf(column);
      if (index < 0) {
        throw new Error(`the response format changed: the company file has no column ${column}`);
      }
      return index;
    };
    return {
      cnpj: indexOf(COLUMN_CNPJ),
      ticker: indexOf(COLUMN_TICKER),
      reference: indexOf(COLUMN_REFERENCE),
    };
  }
}
