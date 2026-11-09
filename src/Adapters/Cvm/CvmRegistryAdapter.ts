import { createReadStream } from "node:fs";
import { join } from "node:path";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import type { LegalIdLookup } from "@/Protocols/CvmProtocol.ts";
import type { ProviderPort, ProviderRequest, ProviderResult } from "@/Protocols/ProviderProtocol.ts";
import { CvmAdapter } from "@/Adapters/Cvm/CvmAdapter.ts";
import { CsvUtil } from "@/Utils/CsvUtil.ts";
import { CvmUtil } from "@/Utils/CvmUtil.ts";
import { TempFileUtil } from "@/Utils/TempFileUtil.ts";

const COMPANY_FILE = "cad_cia_aberta.csv";
const COMPANY_PATH = `/dados/CIA_ABERTA/CAD/DADOS/${COMPANY_FILE}`;
const COLUMN_CNPJ = "CNPJ_CIA";

export class CvmRegistryAdapter implements ProviderPort<"registry"> {
  static readonly VENDOR = "cvm";

  readonly category = "registry";
  readonly vendor = CvmRegistryAdapter.VENDOR;
  readonly markets = ["BR"] as const;
  readonly assetTypes = ["stock"] as const;

  private readonly http: HttpPort;
  private readonly resolveCnpj: LegalIdLookup;
  private readonly baseUrl: string;

  constructor(http: HttpPort, resolveCnpj: LegalIdLookup, baseUrl: string = CvmAdapter.BASE_URL) {
    this.http = http;
    this.resolveCnpj = resolveCnpj;
    this.baseUrl = baseUrl;
  }

  async fetchTables(request: ProviderRequest): Promise<ProviderResult> {
    // Why: a company's registry (legal name, trade name, sector and situation) comes from CVM's company file, found by the CNPJ the ticker resolves to.
    const cnpj = await this.resolveCnpj(request.market, request.ticker);
    if (cnpj === undefined) {
      throw new Error(CvmUtil.buildUnmappedMessage(request.market, request.ticker));
    }
    const record = await TempFileUtil.runInTempDir(async (directory) => {
      const path = join(directory, COMPANY_FILE);
      await this.http.downloadToFile(`${this.baseUrl}${COMPANY_PATH}`, path);
      return CvmRegistryAdapter.findCompany(createReadStream(path), cnpj);
    });
    if (record === undefined) {
      throw new Error(`CVM's company file has no company with the CNPJ ${cnpj}; no row was written`);
    }
    return {
      source: CvmRegistryAdapter.VENDOR,
      tables: {
        company_registry: [{
          market: request.market,
          ticker: request.ticker,
          asset_type: "stock",
          legal_id: cnpj,
          company_name: CsvUtil.readText(record.DENOM_SOCIAL),
          trade_name: CsvUtil.readText(record.DENOM_COMERC),
          sector: CsvUtil.readText(record.SETOR_ATIV),
          situation: CsvUtil.readText(record.SIT),
          cvm_code: CsvUtil.readText(record.CD_CVM),
          source: CvmRegistryAdapter.VENDOR,
        }],
      },
    };
  }

  static async findCompany(
    chunks: AsyncIterable<Uint8Array>,
    cnpj: string,
  ): Promise<Record<string, string> | undefined> {
    for await (const record of CsvUtil.readRecords(CvmUtil.readLines(chunks))) {
      if (record[COLUMN_CNPJ] === cnpj) {
        return record;
      }
    }
    return undefined;
  }
}
