import { createReadStream } from "node:fs";
import { join } from "node:path";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import type { CvmCompanyReading, CvmColumnToText, LegalIdLookup } from "@/Protocols/CvmProtocol.ts";
import type { ProviderFile, ProviderPort, ProviderRequest, ProviderResult } from "@/Protocols/ProviderProtocol.ts";
import { CvmAdapter } from "@/Adapters/Cvm/CvmAdapter.ts";
import { AssetIdUtil } from "@/Utils/AssetIdUtil.ts";
import { CsvUtil } from "@/Utils/CsvUtil.ts";
import { CvmUtil } from "@/Utils/CvmUtil.ts";
import { TempFileUtil } from "@/Utils/TempFileUtil.ts";
import { ZipFileUtil } from "@/Utils/ZipFileUtil.ts";

const COMPANY_FILE = "cad_cia_aberta.csv";
const COMPANY_PATH = `/dados/CIA_ABERTA/CAD/DADOS/${COMPANY_FILE}`;
const COLUMN_CNPJ = "CNPJ_CIA";
const FILING_DATASET = "cia_aberta-fca-geral";
const FILING_FILE_PREFIX = "fca_cia_aberta_geral_";
const COLUMN_FILING_CNPJ = "CNPJ_Companhia";
// Why: the attributes of a company are the ones of the FCA's general form that the server reads; each attribute keeps its CVM column.
const FILING_ATTRIBUTES: readonly (readonly [attribute: string, column: string])[] = [
  ["ir_site", "Pagina_Web"],
  ["activity_description", "Descricao_Atividade"],
  ["activity_sector", "Setor_Atividade"],
  ["previous_legal_name", "Nome_Empresarial_Anterior"],
];

export class CvmRegistryAdapter implements ProviderPort<"registry"> {
  static readonly VENDOR = "cvm";

  readonly category = "registry";
  readonly vendor = CvmRegistryAdapter.VENDOR;
  readonly markets = ["BR"] as const;
  readonly assetTypes = ["stock"] as const;

  private readonly http: HttpPort;
  private readonly resolveCnpj: LegalIdLookup;
  private readonly baseUrl: string;
  private readonly currentYear: () => number;

  constructor(
    http: HttpPort,
    resolveCnpj: LegalIdLookup,
    baseUrl: string = CvmAdapter.BASE_URL,
    currentYear: () => number = () => new Date().getUTCFullYear(),
  ) {
    this.http = http;
    this.resolveCnpj = resolveCnpj;
    this.baseUrl = baseUrl;
    this.currentYear = currentYear;
  }

  async fetchTables(request: ProviderRequest): Promise<ProviderResult> {
    // Why: a company's registry (legal name, trade name, sector and situation) comes from CVM's company file, found by the CNPJ the ticker resolves to.
    const cnpj = await this.resolveCnpj(request.market, request.ticker);
    if (cnpj === undefined) {
      throw new Error(CvmUtil.buildUnmappedMessage(request.market, request.ticker));
    }
    const { record, filing, files } = await this.readCompany(cnpj);
    if (record === undefined) {
      throw new Error(`CVM's company file has no company with the CNPJ ${cnpj}; no row was written`);
    }
    const assetId = AssetIdUtil.build({ market: request.market, assetType: "stock", code: request.ticker });
    return {
      source: CvmRegistryAdapter.VENDOR,
      tables: {
        asset: [{
          asset_id: assetId,
          market: request.market,
          asset_type: "stock",
          code: request.ticker,
          legal_id: cnpj,
          name: CsvUtil.readText(record.DENOM_SOCIAL),
          trade_name: CsvUtil.readText(record.DENOM_COMERC),
          sector: CsvUtil.readText(record.SETOR_ATIV),
          situation: CsvUtil.readText(record.SIT),
          cvm_code: CsvUtil.readText(record.CD_CVM),
        }],
        asset_attribute: CvmRegistryAdapter.buildAttributes(assetId, filing),
      },
      files,
    };
  }

  async readNames(cnpj: string): Promise<string[]> {
    const { record, filing } = await this.readCompany(cnpj);
    // Why: the names a proceeding may be filed under are the company's registry name and its previous legal name, the two names CVM keeps for it (issue #41, S3).
    return [record?.DENOM_SOCIAL, filing?.Nome_Empresarial_Anterior]
      .filter((name): name is string => name !== undefined && name.trim() !== "");
  }

  private async readCompany(cnpj: string): Promise<CvmCompanyReading> {
    const record = await TempFileUtil.runInTempDir(async (directory) => {
      const path = join(directory, COMPANY_FILE);
      await this.http.downloadToFile(`${this.baseUrl}${COMPANY_PATH}`, path);
      return CvmRegistryAdapter.findCompany(createReadStream(path), cnpj);
    });
    const files: ProviderFile[] = [];
    const filing = await this.readLatestFiling(cnpj, files);
    return { record, filing, files };
  }

  private async readLatestFiling(cnpj: string, files: ProviderFile[]): Promise<CvmColumnToText | undefined> {
    // Why: the company is read from the latest year that has it, the year of the current file first; an older year is read only when the company is missing from the newer ones.
    const year = this.currentYear();
    for (const referenceYear of [year, year - 1]) {
      const url = `${this.baseUrl}/dados/CIA_ABERTA/DOC/FCA/DADOS/fca_cia_aberta_${referenceYear}.zip`;
      const key = { dataset: FILING_DATASET, year: referenceYear };
      const found = await CvmUtil.downloadCvmFile(this.http, url, key, files, async (zip) => {
        const lines = CvmUtil.readLines(await ZipFileUtil.openEntry(zip, `${FILING_FILE_PREFIX}${referenceYear}.csv`));
        return CvmRegistryAdapter.findLatestFiling(lines, cnpj);
      });
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  }

  static buildAttributes(assetId: string, filing: CvmColumnToText | undefined): Record<string, string>[] {
    // Why: a column CVM leaves empty writes no row, so an attribute a company does not have is absent rather than an empty value.
    return FILING_ATTRIBUTES.flatMap(([attribute, column]) => {
      const value = CsvUtil.readText(filing?.[column]);
      return value === null ? [] : [{ asset_id: assetId, attribute, value }];
    });
  }

  static async findCompany(chunks: AsyncIterable<Uint8Array>, cnpj: string): Promise<CvmColumnToText | undefined> {
    for await (const record of CsvUtil.readRecords(CvmUtil.readLines(chunks))) {
      if (record[COLUMN_CNPJ] === cnpj) {
        return record;
      }
    }
    return undefined;
  }

  static async findLatestFiling(lines: AsyncIterable<string>, cnpj: string): Promise<CvmColumnToText | undefined> {
    let latest: CvmColumnToText | undefined;
    for await (const record of CsvUtil.readRecords(lines)) {
      if (record[COLUMN_FILING_CNPJ] === cnpj && (latest === undefined || CvmRegistryAdapter.isLater(record, latest))) {
        latest = record;
      }
    }
    return latest;
  }

  private static isLater(candidate: CvmColumnToText, current: CvmColumnToText): boolean {
    // Why: a company has one row per reference date and version; the latest reference date wins, and within it the highest version (issue #41, S2).
    const candidateDate = candidate.Data_Referencia ?? "";
    const currentDate = current.Data_Referencia ?? "";
    if (candidateDate !== currentDate) {
      return candidateDate > currentDate;
    }
    return Number(candidate.Versao ?? 0) > Number(current.Versao ?? 0);
  }
}
