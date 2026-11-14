import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import type { CvmDefendant, LegalIdLookup } from "@/Protocols/CvmProtocol.ts";
import type { ProceedingsProvider } from "@/Protocols/ProceedingsProviderProtocol.ts";
import type { ProviderFile, ProviderRequest, ProviderResult, ProviderRow } from "@/Protocols/ProviderProtocol.ts";
import { CvmAdapter } from "@/Adapters/Cvm/CvmAdapter.ts";
import { AssetIdUtil } from "@/Utils/AssetIdUtil.ts";
import { CompanyNameUtil } from "@/Utils/CompanyNameUtil.ts";
import { CsvUtil } from "@/Utils/CsvUtil.ts";
import { CvmUtil } from "@/Utils/CvmUtil.ts";
import { ZipFileUtil } from "@/Utils/ZipFileUtil.ts";

const PROCEEDINGS_DATASET = "cvm-sancionador";
const PROCEEDINGS_PATH = "/dados/PROCESSO/SANCIONADOR/DADOS/processo_sancionador.zip";
const CASES_FILE = "processo_sancionador.csv";
const DEFENDANTS_FILE = "processo_sancionador_acusado.csv";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

export class CvmProceedingsAdapter implements ProceedingsProvider {
  static readonly VENDOR = "cvm";

  readonly category = "proceedings";
  readonly vendor = CvmProceedingsAdapter.VENDOR;
  readonly markets = ["BR"] as const;
  readonly assetTypes = ["stock"] as const;

  private readonly http: HttpPort;
  private readonly resolveCnpj: LegalIdLookup;
  private readonly readNames: (cnpj: string) => Promise<readonly string[]>;
  private readonly baseUrl: string;
  private readonly currentYear: () => number;

  constructor(
    http: HttpPort,
    resolveCnpj: LegalIdLookup,
    readNames: (cnpj: string) => Promise<readonly string[]>,
    baseUrl: string = CvmAdapter.BASE_URL,
    currentYear: () => number = () => new Date().getUTCFullYear(),
  ) {
    this.http = http;
    this.resolveCnpj = resolveCnpj;
    this.readNames = readNames;
    this.baseUrl = baseUrl;
    this.currentYear = currentYear;
  }

  async fetchTables(request: ProviderRequest): Promise<ProviderResult> {
    const cnpj = await this.resolveCnpj(request.market, request.ticker);
    if (cnpj === undefined) {
      throw new Error(CvmUtil.buildUnmappedMessage(request.market, request.ticker));
    }
    // Why: a defendant is linked to a stock only when its name equals the stock's name or previous legal name after one normalization; no partial or fuzzy match is made (issue #41, P3, S3).
    const names = new Set((await this.readNames(cnpj)).map((name) => CompanyNameUtil.normalize(name)).filter((name) => name !== ""));
    const files: ProviderFile[] = [];
    const rows = await CvmProceedingsAdapter.readRows(this.http, this.baseUrl, names, this.currentYear(), files);
    const assetId = AssetIdUtil.build({ market: request.market, assetType: "stock", code: request.ticker });
    return {
      source: CvmProceedingsAdapter.VENDOR,
      tables: { asset_proceedings: rows.map((row) => ({ asset_id: assetId, ...row })) },
      files,
    };
  }

  private static async readRows(
    http: HttpPort,
    baseUrl: string,
    names: ReadonlySet<string>,
    year: number,
    files: ProviderFile[],
  ): Promise<ProviderRow[]> {
    if (names.size === 0) {
      return [];
    }
    const rows = await CvmUtil.downloadCvmFile(
      http,
      `${baseUrl}${PROCEEDINGS_PATH}`,
      { dataset: PROCEEDINGS_DATASET, year },
      files,
      (zip) => CvmProceedingsAdapter.readMatches(zip, names),
    );
    if (rows === undefined) {
      throw new Error("CVM's sanctioning proceedings file could not be read; no row was written");
    }
    return rows;
  }

  static async readMatches(zipPath: string, names: ReadonlySet<string>): Promise<ProviderRow[]> {
    const caseNumberToDefendants = await CvmProceedingsAdapter.readDefendants(zipPath, names);
    const rows: ProviderRow[] = [];
    if (caseNumberToDefendants.size === 0) {
      return rows;
    }
    const cases = CsvUtil.readRecords(CvmUtil.readLines(await ZipFileUtil.openEntry(zipPath, CASES_FILE)));
    const seen = new Set<string>();
    for await (const record of cases) {
      const caseNumber = record.NUP ?? "";
      const defendants = caseNumberToDefendants.get(caseNumber);
      if (defendants === undefined || seen.has(caseNumber)) {
        continue;
      }
      seen.add(caseNumber);
      for (const defendant of defendants) {
        rows.push({
          case_number: caseNumber,
          defendant_name: defendant.name,
          subject: CsvUtil.readText(record.Objeto),
          summary: CsvUtil.readText(record.Ementa),
          opened_time: CvmProceedingsAdapter.readDate(record.Data_Abertura),
          current_phase: CsvUtil.readText(record.Fase_Atual),
          current_subphase: CsvUtil.readText(record.Subfase_Atual),
          last_movement_time: CvmProceedingsAdapter.readDate(record.Data_Ultima_Movimentacao),
          defendant_status: defendant.situation,
          defendant_status_time: defendant.statusTime,
        });
      }
    }
    return rows;
  }

  private static async readDefendants(
    zipPath: string,
    names: ReadonlySet<string>,
  ): Promise<Map<string, CvmDefendant[]>> {
    const caseNumberToDefendantNameToDefendant = new Map<string, Map<string, CvmDefendant>>();
    const defendants = CsvUtil.readRecords(CvmUtil.readLines(await ZipFileUtil.openEntry(zipPath, DEFENDANTS_FILE)));
    for await (const record of defendants) {
      const name = (record.Nome_Acusado ?? "").trim();
      if (!names.has(CompanyNameUtil.normalize(name))) {
        continue;
      }
      const caseNumber = record.NUP ?? "";
      const statusTime = CvmProceedingsAdapter.readDate(record.Data_Situacao);
      const defendantNameToDefendant = caseNumberToDefendantNameToDefendant.get(caseNumber)
        ?? new Map<string, CvmDefendant>();
      // Why: a defendant has one row per status, and the row keeps the latest status of that defendant in the case.
      const current = defendantNameToDefendant.get(name);
      if (current === undefined || (current.statusTime ?? "") <= (statusTime ?? "")) {
        defendantNameToDefendant.set(name, { situation: CsvUtil.readText(record.Situacao), name, statusTime });
      }
      caseNumberToDefendantNameToDefendant.set(caseNumber, defendantNameToDefendant);
    }
    return new Map([...caseNumberToDefendantNameToDefendant].map(([caseNumber, defendantNameToDefendant]) => [
      caseNumber,
      [...defendantNameToDefendant.values()],
    ]));
  }

  private static readDate(value: string | undefined): string | null {
    const text = CsvUtil.readText(value);
    if (text === null) {
      return null;
    }
    if (!DATE_PATTERN.test(text)) {
      // Why: a date in another format would be stored as a wrong day, so the load stops and names the value.
      throw new Error(`a date of CVM's sanctioning proceedings has another format: ${text}`);
    }
    return text;
  }
}
