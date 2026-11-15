import { join } from "node:path";
import type { Readable } from "node:stream";
import type { ComplaintsProvider } from "@/Protocols/ComplaintsProviderProtocol.ts";
import type { ConsumidorGovMonthFile, ConsumidorGovColumnToText, ConsumidorGovSelection, ConsumidorGovTradeCounts } from "@/Protocols/ConsumidorGovProtocol.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import type { PeriodWindow } from "@/Protocols/PeriodProtocol.ts";
import type { ProviderFile, ProviderRequest, ProviderResult, ProviderRow } from "@/Protocols/ProviderProtocol.ts";
import { ConsumidorGovPublicationsSchema } from "@/Schemas/ConsumidorGovSchema.ts";
import { AssetIdUtil } from "@/Utils/AssetIdUtil.ts";
import { CsvUtil } from "@/Utils/CsvUtil.ts";
import { CvmUtil } from "@/Utils/CvmUtil.ts";
import { SearchTermUtil } from "@/Utils/SearchTermUtil.ts";
import { TempFileUtil } from "@/Utils/TempFileUtil.ts";
import { ZipFileUtil } from "@/Utils/ZipFileUtil.ts";

const PUBLICATIONS_PATH = "/pages/publicacao/externo/publicacoes.json?indicadorTipoPublicacao=2";
// Why: the list is served in latin-1, and the monthly files are named finalizadas_YYYY-MM.zip (issue #59, phase 1).
const PUBLICATIONS_ENCODING = "latin1";
const DOWNLOAD_PATH_PREFIX = "/pages/publicacao/externo";
const MONTH_FILE_PATTERN = /^finalizadas_(\d{4})-(\d{2})\.zip$/u;
const FIRST_SERVED_MONTH = "2021-08";
const DATASET = "consumidor-gov-finalizadas";
const RATED_SITUATION = "Finalizada avaliada";
const RESOLVED_OUTCOME = "Resolvida";
const ANSWERED = "Sim";
const MONTHS_IN_YEAR = 12;
const YEAR_LENGTH = 4;
const YEAR_MONTH_LENGTH = 7;
const MONTH_START_INDEX = 5;
const MONTH_LENGTH = 2;
const REQUIRED_COLUMN = "nome_fantasia";

export class ConsumidorGovAdapter implements ComplaintsProvider {
  static readonly VENDOR = "consumidor_gov";
  static readonly HOST = "www.consumidor.gov.br";
  static readonly BASE_URL = `https://${ConsumidorGovAdapter.HOST}`;

  readonly category = "complaints";
  readonly vendor = ConsumidorGovAdapter.VENDOR;
  readonly markets = ["BR"] as const;
  readonly assetTypes = ["complaints"] as const;

  private readonly http: HttpPort;
  private readonly baseUrl: string;

  constructor(http: HttpPort, baseUrl: string = ConsumidorGovAdapter.BASE_URL) {
    this.http = http;
    this.baseUrl = baseUrl;
  }

  async fetchTables(request: ProviderRequest): Promise<ProviderResult> {
    const term = SearchTermUtil.readTerm(request.ticker);
    if (term === "") {
      throw new Error("the complaints term is empty; no row was written");
    }
    const published = await this.listFiles();
    const selection = ConsumidorGovAdapter.selectMonths(published, request.period);
    const assetId = AssetIdUtil.build({ market: request.market, assetType: "complaints", code: request.ticker });
    const rows: ProviderRow[] = [];
    const files: ProviderFile[] = [];
    for (const month of selection.months) {
      const tradeNameToCounts = await this.readMonth(month, term, files);
      for (const [tradeName, counts] of tradeNameToCounts) {
        const row = ConsumidorGovAdapter.buildRow(assetId, tradeName, month.month, counts);
        rows.push(row);
      }
    }
    // Why: a month after the latest published file is not an error: a default period runs to the end of the year, and that month is not published yet.
    const itemErrors = selection.notPublished.map((month) => `${month} is not published yet; its complaints are not stored`);
    return {
      source: ConsumidorGovAdapter.VENDOR,
      tables: { asset_complaints: rows },
      files,
      ...(itemErrors.length === 0 ? {} : { itemErrors }),
    };
  }

  private async listFiles(): Promise<ConsumidorGovMonthFile[]> {
    const text = await this.http.getText(`${this.baseUrl}${PUBLICATIONS_PATH}`, PUBLICATIONS_ENCODING);
    const parsed = ConsumidorGovAdapter.parseJson(text);
    const entries = ConsumidorGovPublicationsSchema.parse(parsed);
    // Why: a month can be published again; the later publication (the greater code) is the one read.
    const monthToCode = new Map<string, string>();
    for (const entry of entries) {
      const match = MONTH_FILE_PATTERN.exec(entry.nomeArquivo);
      if (match === null) {
        continue;
      }
      const month = `${match[1]}-${match[2]}`;
      const current = monthToCode.get(month);
      if (current === undefined || entry.codigo > current) {
        monthToCode.set(month, entry.codigo);
      }
    }
    return [...monthToCode.entries()].map(([month, code]) => ({
      month,
      url: `${this.baseUrl}${DOWNLOAD_PATH_PREFIX}/${code}/download`,
    }));
  }

  private static parseJson(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error("Consumidor.gov.br's publication list is not JSON (the site answered an error page); no row was written", { cause: error });
    }
  }

  static selectMonths(
    published: readonly ConsumidorGovMonthFile[],
    period: PeriodWindow | undefined,
  ): ConsumidorGovSelection {
    const sorted = [...published].sort((left, right) => left.month.localeCompare(right.month));
    const latest = sorted[sorted.length - 1];
    if (latest === undefined) {
      throw new Error("Consumidor.gov.br publishes no monthly file; no row was written");
    }
    if (period === undefined) {
      return { months: [latest], notPublished: [] };
    }
    const from = period.from.slice(0, YEAR_MONTH_LENGTH);
    const to = period.to.slice(0, YEAR_MONTH_LENGTH);
    if (from < FIRST_SERVED_MONTH) {
      throw new Error(`Consumidor.gov.br serves complaints from ${FIRST_SERVED_MONTH}; the period starts in ${from}; no row was written`);
    }
    const months: ConsumidorGovMonthFile[] = [];
    const notPublished: string[] = [];
    for (const month of ConsumidorGovAdapter.readMonthsBetween(from, to)) {
      const file = sorted.find((candidate) => candidate.month === month);
      if (file !== undefined) {
        months.push(file);
      } else if (month > latest.month) {
        notPublished.push(month);
      } else {
        throw new Error(`Consumidor.gov.br has no monthly file for ${month}; no row was written`);
      }
    }
    return { months, notPublished };
  }

  static readMonthsBetween(from: string, to: string): string[] {
    const months: string[] = [];
    let year = Number(from.slice(0, YEAR_LENGTH));
    let month = Number(from.slice(MONTH_START_INDEX, MONTH_START_INDEX + MONTH_LENGTH));
    while (ConsumidorGovAdapter.formatMonth(year, month) <= to) {
      months.push(ConsumidorGovAdapter.formatMonth(year, month));
      month += 1;
      if (month > MONTHS_IN_YEAR) {
        month = 1;
        year += 1;
      }
    }
    return months;
  }

  private static formatMonth(year: number, month: number): string {
    return `${year}-${String(month).padStart(MONTH_LENGTH, "0")}`;
  }

  private async readMonth(
    file: ConsumidorGovMonthFile,
    term: string,
    files: ProviderFile[],
  ): Promise<Map<string, ConsumidorGovTradeCounts>> {
    const name = `finalizadas_${file.month}.zip`;
    return TempFileUtil.runInTempDir(async (directory) => {
      const path = join(directory, name);
      try {
        await this.http.downloadToFile(file.url, path);
      } catch (error) {
        throw new Error(`Consumidor.gov.br's file ${name} could not be downloaded (${ConsumidorGovAdapter.describe(error)}); no row was written`, { cause: error });
      }
      const year = Number(file.month.slice(0, YEAR_LENGTH));
      const record = await CvmUtil.buildFileRecord(file.url, DATASET, year, path);
      files.push(record);
      const entry = await ConsumidorGovAdapter.openMonthEntry(path, file.month, name);
      return ConsumidorGovAdapter.countTerm(CvmUtil.readLines(entry, "utf-8"), term);
    });
  }

  private static async openMonthEntry(path: string, month: string, name: string): Promise<Readable> {
    try {
      return await ZipFileUtil.openEntry(path, `finalizadas_${month}.csv`);
    } catch (error) {
      throw new Error(`Consumidor.gov.br's file ${name} is not the one the adapter reads (${ConsumidorGovAdapter.describe(error)}); no row was written`, { cause: error });
    }
  }

  static async countTerm(lines: AsyncIterable<string>, term: string): Promise<Map<string, ConsumidorGovTradeCounts>> {
    const tradeNameToCounts = new Map<string, ConsumidorGovTradeCounts>();
    let isChecked = false;
    for await (const record of CsvUtil.readRecords(lines)) {
      if (!isChecked) {
        if (!(REQUIRED_COLUMN in record)) {
          throw new Error(`the response format changed: the column ${REQUIRED_COLUMN} is missing; no row was written`);
        }
        isChecked = true;
      }
      const tradeName = record[REQUIRED_COLUMN] ?? "";
      if (!SearchTermUtil.isMatch(tradeName, term)) {
        continue;
      }
      const counts = tradeNameToCounts.get(tradeName) ?? ConsumidorGovAdapter.createCounts();
      ConsumidorGovAdapter.addRecord(counts, record);
      tradeNameToCounts.set(tradeName, counts);
    }
    return tradeNameToCounts;
  }

  private static createCounts(): ConsumidorGovTradeCounts {
    return { complaints: 0, answered: 0, rated: 0, resolved: 0, scoreSum: 0, scoreCount: 0, daysSum: 0, daysCount: 0 };
  }

  private static addRecord(counts: ConsumidorGovTradeCounts, record: ConsumidorGovColumnToText): void {
    counts.complaints += 1;
    counts.answered += record.respondida === ANSWERED ? 1 : 0;
    counts.rated += record.situacao === RATED_SITUATION ? 1 : 0;
    counts.resolved += record.avaliacao_reclamacao === RESOLVED_OUTCOME ? 1 : 0;
    const score = CsvUtil.readNumber(record.nota_do_consumidor);
    if (score !== null) {
      counts.scoreSum += score;
      counts.scoreCount += 1;
    }
    const days = CsvUtil.readNumber(record.tempo_resposta);
    if (days !== null) {
      counts.daysSum += days;
      counts.daysCount += 1;
    }
  }

  static buildRow(assetId: string, tradeName: string, month: string, counts: ConsumidorGovTradeCounts): ProviderRow {
    return {
      asset_id: assetId,
      trade_name: tradeName,
      reference_time_start: `${month}-01`,
      complaint_count: counts.complaints,
      answered: counts.answered,
      rated: counts.rated,
      resolved: counts.resolved,
      // Why: a mean with no value is null, not zero: a month with no rated complaint has no score.
      score_mean: counts.scoreCount === 0 ? null : counts.scoreSum / counts.scoreCount,
      response_days_mean: counts.daysCount === 0 ? null : counts.daysSum / counts.daysCount,
    };
  }

  private static describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
