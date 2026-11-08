import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import type { CvmFilingKind, CvmFundDocType, FundFilingCollection } from "@/Protocols/CvmProtocol.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import type { ProviderRow } from "@/Protocols/ProviderProtocol.ts";
import { PeriodService } from "@/Services/PeriodService.ts";
import { CvmUtil } from "@/Utils/CvmUtil.ts";

const DATASET = "fi-doc-eventual";
const SEPARATOR = ";";
const FILING_ID_LENGTH = 32;
const LOCAL_TIME_OFFSET = "T00:00:00-03:00";
const REQUIRED_COLUMNS = ["CNPJ_FUNDO_CLASSE", "DT_COMPTC", "DT_RECEB", "TP_DOC", "ID_DOC", "LINK_ARQ"] as const;
const DOC_TYPE_TO_KIND: ReadonlyMap<CvmFundDocType, CvmFilingKind> = new Map<CvmFundDocType, CvmFilingKind>([
  ["RELAT GERENCIAL", "management_report"],
  ["FATO RELEV", "material_fact"],
]);
const FORMAT_ERROR = "the response format changed: the eventual fund file is not the one the adapter reads; no row was written";

export class CvmFundFilingAdapter {
  private readonly http: HttpPort;
  private readonly baseUrl: string;

  constructor(http: HttpPort, baseUrl: string) {
    this.http = http;
    this.baseUrl = baseUrl;
  }

  async fetchFilings(collection: FundFilingCollection): Promise<ProviderRow[]> {
    const identityToRow = new Map<string, ProviderRow>();
    for (const year of PeriodService.readYears(collection.window)) {
      const url = `${this.baseUrl}/dados/FI/DOC/EVENTUAL/DADOS/eventual_fi_${year}.csv`;
      const bytes = await CvmUtil.loadFile(this.http, url, DATASET, year, collection.files);
      if (bytes === undefined) {
        continue;
      }
      const lines = CvmUtil.readLines(Readable.from([bytes]));
      const rows = await CvmFundFilingAdapter.readRows(lines, collection);
      for (const row of rows) {
        CvmUtil.keep(identityToRow, row);
      }
    }
    return [...identityToRow.values()];
  }

  static async readRows(lines: AsyncIterable<string>, collection: FundFilingCollection): Promise<ProviderRow[]> {
    const rows: ProviderRow[] = [];
    let columnToIndex: ReadonlyMap<string, number> | undefined;
    for await (const line of lines) {
      if (columnToIndex === undefined) {
        columnToIndex = CvmFundFilingAdapter.readColumns(line);
        continue;
      }
      const row = CvmFundFilingAdapter.readLine(line, columnToIndex, collection);
      if (row !== undefined) {
        rows.push(row);
      }
    }
    return rows;
  }

  private static readColumns(header: string): ReadonlyMap<string, number> {
    const names = header.split(SEPARATOR);
    const entries = REQUIRED_COLUMNS.map((column) => {
      const index = names.indexOf(column);
      if (index < 0) {
        throw new Error(`${FORMAT_ERROR}; the column ${column} is missing`);
      }
      return [column, index] as const;
    });
    return new Map<string, number>(entries);
  }

  private static readLine(
    line: string,
    columnToIndex: ReadonlyMap<string, number>,
    collection: FundFilingCollection,
  ): ProviderRow | undefined {
    if (line === "") {
      return undefined;
    }
    const fields = line.split(SEPARATOR);
    const readField = (column: string): string => fields[columnToIndex.get(column) ?? -1] ?? "";
    // Why: a filing is kept only for the fund whose CNPJ the ticker maps to; another fund's documents are never filled in for it (issue #28, AC3).
    if (CvmUtil.readDigits(readField("CNPJ_FUNDO_CLASSE")) !== collection.cnpjDigits) {
      return undefined;
    }
    const referenceDate = readField("DT_COMPTC");
    if (!PeriodService.isDateInWindow(collection.window, referenceDate)) {
      return undefined;
    }
    const docType = readField("TP_DOC");
    const deliveredOn = readField("DT_RECEB");
    const identity = ["eventual", readField("ID_DOC"), deliveredOn, readField("LINK_ARQ")].join("|");
    return {
      ...collection.key,
      filing_id: createHash("sha256").update(identity).digest("hex").slice(0, FILING_ID_LENGTH),
      filing_type: CvmFundFilingAdapter.readKind(docType),
      category: docType,
      reference_date: referenceDate,
      delivered_at: deliveredOn === "" ? null : `${deliveredOn}${LOCAL_TIME_OFFSET}`,
      subject: null,
      url: CvmUtil.readOrNull(readField("LINK_ARQ")),
      file_hash: null,
      source: CvmUtil.VENDOR,
    };
  }

  private static readKind(docType: string): CvmFilingKind {
    // Why: the CVM document type names are kept as the category; the filing type is set only for the two types the server reads by name.
    const kind = [...DOC_TYPE_TO_KIND].find(([known]) => known === docType);
    return kind?.[1] ?? "other";
  }
}
