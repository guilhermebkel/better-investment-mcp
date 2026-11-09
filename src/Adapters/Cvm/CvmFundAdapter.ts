import { createReadStream } from "node:fs";
import { join } from "node:path";
import { HttpFailureError } from "@/Errors/HttpFailureError.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import type { ProviderPort, ProviderRequest, ProviderResult, ProviderRow } from "@/Protocols/ProviderProtocol.ts";
import { CvmAdapter } from "@/Adapters/Cvm/CvmAdapter.ts";
import type { FundKeyed } from "@/Protocols/FundProtocol.ts";
import { CsvUtil } from "@/Utils/CsvUtil.ts";
import { CvmUtil } from "@/Utils/CvmUtil.ts";
import { TempFileUtil } from "@/Utils/TempFileUtil.ts";
import { ZipFileUtil } from "@/Utils/ZipFileUtil.ts";

const MONTHS_BACK = 12;
const MONTH_PAD_LENGTH = 2;
const NOT_FOUND_STATUS = 404;
const CNPJ_PATTERN = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/u;
const REGISTRY_FILE = "cad_fi.csv";
const REGISTRY_PATH = "/dados/FI/CAD/DADOS/cad_fi.csv";
const DAILY_PATH = "/dados/FI/DOC/INF_DIARIO/DADOS";
const HOLDINGS_PATH = "/dados/FI/DOC/CDA/DADOS";
const HOLDINGS_ENTRY = /^cda_fi_BLC_(\d)_/iu;
const CSV_ENTRY = /\.csv$/iu;
const COLUMN_FUND_CNPJ = "CNPJ_FUNDO";
const COLUMN_CLASS_CNPJ = "CNPJ_FUNDO_CLASSE";

export class CvmFundAdapter implements ProviderPort<"fund"> {
  static readonly VENDOR = "cvm";

  readonly category = "fund";
  readonly vendor = CvmFundAdapter.VENDOR;
  readonly markets = ["FUND"] as const;
  readonly assetTypes = [] as const;

  private readonly http: HttpPort;
  private readonly baseUrl: string;
  private readonly now: () => Date;

  constructor(http: HttpPort, baseUrl: string = CvmAdapter.BASE_URL, now: () => Date = () => new Date()) {
    this.http = http;
    this.baseUrl = baseUrl;
    this.now = now;
  }

  async fetchTables(request: ProviderRequest): Promise<ProviderResult> {
    // Why: a fund is read by the CNPJ of its class, the key a query gives; its registry, its daily quotas and its holdings come from CVM's open files, the monthly ones for the last twelve months.
    const cnpj = request.ticker;
    if (!CNPJ_PATTERN.test(cnpj)) {
      throw new Error(`the fund key ${cnpj} is not a CNPJ in the form 00.000.000/0000-00`);
    }
    return TempFileUtil.runInTempDir(async (directory) => {
      const registry = await this.readRegistry(directory, cnpj);
      const daily: ProviderRow[] = [];
      const holdings: ProviderRow[] = [];
      for (const yearMonth of CvmFundAdapter.listRecentMonths(this.now(), MONTHS_BACK)) {
        daily.push(...await this.readDaily(directory, { cnpj, yearMonth }));
        holdings.push(...await this.readHoldings(directory, { cnpj, yearMonth }));
      }
      return {
        source: CvmFundAdapter.VENDOR,
        tables: { fund_registry: registry === undefined ? [] : [registry], fund_daily: daily, fund_holdings: holdings },
      };
    });
  }

  static listRecentMonths(now: Date, count: number): string[] {
    // Why: a month is named YYYYMM, and the months are the last twelve before the current one, since CVM publishes a month after it ends.
    const months: string[] = [];
    for (let back = count; back >= 1; back -= 1) {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
      months.push(`${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(MONTH_PAD_LENGTH, "0")}`);
    }
    return months;
  }

  private async readRegistry(directory: string, cnpj: string): Promise<ProviderRow | undefined> {
    const path = join(directory, REGISTRY_FILE);
    await this.http.downloadToFile(`${this.baseUrl}${REGISTRY_PATH}`, path);
    const chunks = createReadStream(path);
    for await (const record of CsvUtil.readRecords(CvmUtil.readLines(chunks))) {
      if (record[COLUMN_FUND_CNPJ] === cnpj) {
        return {
          cnpj,
          fund_name: CsvUtil.readText(record.DENOM_SOCIAL),
          fund_type: CsvUtil.readText(record.TP_FUNDO),
          class_name: CsvUtil.readText(record.CLASSE),
          situation: CsvUtil.readText(record.SIT),
          administrator: CsvUtil.readText(record.ADMIN),
          administrator_cnpj: CsvUtil.readText(record.CNPJ_ADMIN),
          manager: CsvUtil.readText(record.GESTOR),
          net_worth: CsvUtil.readNumber(record.VL_PATRIM_LIQ),
          net_worth_date: CsvUtil.readText(record.DT_PATRIM_LIQ),
          source: CvmFundAdapter.VENDOR,
        };
      }
    }
    return undefined;
  }

  private async readDaily(directory: string, key: FundKeyed): Promise<ProviderRow[]> {
    const url = `${this.baseUrl}${DAILY_PATH}/inf_diario_fi_${key.yearMonth}.zip`;
    const zipPath = await this.downloadMonth(directory, url, `inf_${key.yearMonth}.zip`);
    if (zipPath === undefined) {
      return [];
    }
    const rows: ProviderRow[] = [];
    for (const entry of (await ZipFileUtil.listEntries(zipPath)).filter((item) => CSV_ENTRY.test(item.name))) {
      const stream = await ZipFileUtil.openEntry(zipPath, entry.name);
      for await (const record of CsvUtil.readRecords(CvmUtil.readLines(stream))) {
        if (record[COLUMN_CLASS_CNPJ] === key.cnpj) {
          rows.push({
            cnpj: key.cnpj,
            date: CsvUtil.readText(record.DT_COMPTC),
            quota: CsvUtil.readNumber(record.VL_QUOTA),
            net_worth: CsvUtil.readNumber(record.VL_PATRIM_LIQ),
            total_value: CsvUtil.readNumber(record.VL_TOTAL),
            subscriptions: CsvUtil.readNumber(record.CAPTC_DIA),
            redemptions: CsvUtil.readNumber(record.RESG_DIA),
            holders: CsvUtil.readNumber(record.NR_COTST),
            source: CvmFundAdapter.VENDOR,
          });
        }
      }
    }
    return rows;
  }

  private async readHoldings(directory: string, key: FundKeyed): Promise<ProviderRow[]> {
    const url = `${this.baseUrl}${HOLDINGS_PATH}/cda_fi_${key.yearMonth}.zip`;
    const zipPath = await this.downloadMonth(directory, url, `cda_${key.yearMonth}.zip`);
    if (zipPath === undefined) {
      return [];
    }
    const rows: ProviderRow[] = [];
    for (const entry of await ZipFileUtil.listEntries(zipPath)) {
      const block = HOLDINGS_ENTRY.exec(entry.name)?.[1];
      if (block === undefined) {
        continue;
      }
      const stream = await ZipFileUtil.openEntry(zipPath, entry.name);
      for await (const record of CsvUtil.readRecords(CvmUtil.readLines(stream))) {
        if (record[COLUMN_CLASS_CNPJ] === key.cnpj) {
          rows.push({
            block,
            cnpj: key.cnpj,
            period: CsvUtil.readText(record.DT_COMPTC),
            application_type: CsvUtil.readText(record.TP_APLIC),
            asset_category: CsvUtil.readText(record.TP_ATIVO),
            asset_code: CsvUtil.readText(record.CD_ATIVO),
            asset_description: CsvUtil.readText(record.DS_ATIVO),
            issuer: CsvUtil.readText(record.EMISSOR),
            quantity: CsvUtil.readNumber(record.QT_POS_FINAL),
            market_value: CsvUtil.readNumber(record.VL_MERC_POS_FINAL),
            source_file: entry.name,
            source: CvmFundAdapter.VENDOR,
          });
        }
      }
    }
    return rows;
  }

  private async downloadMonth(directory: string, url: string, fileName: string): Promise<string | undefined> {
    // Why: a month CVM has not published yet (404) has no rows; any other failure stops the load, with nothing written.
    const path = join(directory, fileName);
    try {
      await this.http.downloadToFile(url, path);
      return path;
    } catch (error) {
      if (error instanceof HttpFailureError && error.status === NOT_FOUND_STATUS) {
        return undefined;
      }
      throw error;
    }
  }
}
