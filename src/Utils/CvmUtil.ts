import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { join } from "node:path";
import { CvmFailureError } from "@/Errors/CvmFailureError.ts";
import { HttpFailureError } from "@/Errors/HttpFailureError.ts";
import { HttpRefusedError } from "@/Errors/HttpRefusedError.ts";
import type { CvmFileKey } from "@/Protocols/CvmFileProtocol.ts";
import type { CvmSubject, LegalIdLookup } from "@/Protocols/CvmProtocol.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import type { PeriodWindow } from "@/Protocols/PeriodProtocol.ts";
import type { ProviderFile, ProviderRequest, ProviderRow } from "@/Protocols/ProviderProtocol.ts";
import { AssetIdUtil } from "@/Utils/AssetIdUtil.ts";
import { TempFileUtil } from "@/Utils/TempFileUtil.ts";

const NOT_FOUND_STATUS = 404;
const CNPJ_NON_DIGITS = /\D/gu;
const LINE_BREAK = /\r?\n/u;

export class CvmUtil {
  static readonly VENDOR = "cvm";
  static readonly HOST = "dados.cvm.gov.br";
  static readonly BASE_URL = `https://${CvmUtil.HOST}`;

  static classifyFailure(error: unknown): CvmFailureError {
    if (error instanceof CvmFailureError) {
      return error;
    }
    if (error instanceof HttpRefusedError) {
      return new CvmFailureError(`blocked or refused request: ${error.message}`);
    }
    if (error instanceof HttpFailureError) {
      return new CvmFailureError(`HTTP error: ${error.message}`);
    }
    const detail = error instanceof Error ? error.message : "unknown error";
    return new CvmFailureError(`file could not be read: ${detail}`);
  }

  static async resolveCnpj(lookup: LegalIdLookup, market: string, ticker: string): Promise<string> {
    const cnpj = await lookup(market, ticker);
    if (cnpj === undefined) {
      throw new CvmFailureError(CvmUtil.buildUnmappedMessage(market, ticker));
    }
    return cnpj;
  }

  static buildZipUrl(baseUrl: string, folder: string, stem: string, year: number): string {
    return `${baseUrl}/dados/CIA_ABERTA/DOC/${folder}/DADOS/${stem}_cia_aberta_${year}.zip`;
  }

  static async guardFailure<Result>(work: () => Promise<Result>): Promise<Result> {
    try {
      return await work();
    } catch (error) {
      throw CvmUtil.classifyFailure(error);
    }
  }

  static async resolveSubject(
    lookup: LegalIdLookup,
    request: ProviderRequest,
    defaultWindow: PeriodWindow,
  ): Promise<CvmSubject> {
    if (request.assetType === undefined) {
      throw new Error("CVM needs the asset type of the asset");
    }
    const cnpj = await CvmUtil.resolveCnpj(lookup, request.market, request.ticker);
    const key = { market: request.market, ticker: request.ticker, asset_type: request.assetType };
    return { key, cnpjDigits: CvmUtil.readDigits(cnpj), window: request.period ?? defaultWindow };
  }

  static buildUnmappedMessage(market: string, ticker: string): string {
    // Why: an unmapped ticker is pending, never guessed from a name or an ISIN (issue #28, S5, AC8).
    return `unmapped: ${market}:${ticker} is pending; no CNPJ is known for it in the CVM company list or the FII list, so none was guessed`;
  }

  static async downloadCvmFile<Result>(
    http: HttpPort,
    url: string,
    key: CvmFileKey,
    files: ProviderFile[],
    work: (path: string) => Promise<Result>,
  ): Promise<Result | undefined> {
    // Why: a CVM file is downloaded to a temporary file owned by this call and handed to the work as a path, so it is read as a stream and removed when the work ends.
    return TempFileUtil.runInTempDir(async (directory) => {
      const path = join(directory, `${key.dataset}-${key.year}`);
      try {
        await http.downloadToFile(url, path);
      } catch (error) {
        if (error instanceof HttpFailureError && error.status === NOT_FOUND_STATUS) {
          return undefined;
        }
        throw error;
      }
      files.push(await CvmUtil.buildFileRecord(url, key.dataset, key.year, path));
      return work(path);
    });
  }

  static async buildFileRecord(url: string, dataset: string, year: number, path: string): Promise<ProviderFile> {
    // Why: the hash and the size identify one version of the file, so a changed file is told apart from the one stored before.
    const hash = createHash("sha256");
    const chunks: AsyncIterable<Buffer> = createReadStream(path);
    let sizeBytes = 0;
    for await (const chunk of chunks) {
      hash.update(chunk);
      sizeBytes += chunk.byteLength;
    }
    return { url, dataset, sizeBytes, referenceYear: year, sha256: hash.digest("hex") };
  }

  static buildAssetFiling(row: ProviderRow): ProviderRow {
    // Why: a filing row is keyed by its asset_id, and its period is the document's reference time (start and end).
    const reference = row.reference_date ?? null;
    return {
      asset_id: AssetIdUtil.build({
        market: String(row.market), assetType: String(row.asset_type), code: String(row.ticker),
      }),
      filing_id: row.filing_id ?? null,
      document_type: row.filing_type ?? null,
      category: row.category ?? null,
      subject: row.subject ?? null,
      reference_time_start: reference,
      reference_time_end: reference,
      published_at: row.delivered_at ?? null,
      url: row.url ?? null,
      file_hash: row.file_hash ?? null,
    };
  }

  static async* readLines(chunks: AsyncIterable<Uint8Array>): AsyncGenerator<string> {
    // Why: the file is decoded in chunks and yielded as whole lines, so the decoded file is never held in memory as one string.
    const decoder = new TextDecoder("windows-1252");
    let carry = "";
    for await (const chunk of chunks) {
      const parts = (carry + decoder.decode(chunk, { stream: true })).split(LINE_BREAK);
      carry = parts.pop() ?? "";
      for (const part of parts) {
        if (part !== "") {
          yield part;
        }
      }
    }
    const last = carry + decoder.decode();
    if (last !== "") {
      yield last;
    }
  }

  static keep(filingIdToRow: Map<string, ProviderRow>, row: ProviderRow): void {
    const id = String(row.filing_id);
    const known = filingIdToRow.get(id);
    if (known === undefined) {
      filingIdToRow.set(id, row);
      return;
    }
    if (JSON.stringify(known) !== JSON.stringify(row)) {
      throw new Error(`the CVM file repeats the filing ${id} with other content; no row was written`);
    }
  }

  static readOrNull(value: string | undefined): string | null {
    return value === undefined || value === "" ? null : value;
  }

  static readDigits(cnpj: string): string {
    return cnpj.replace(CNPJ_NON_DIGITS, "");
  }
}
