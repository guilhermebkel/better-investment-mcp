import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import type { ProviderPort, ProviderRequest, ProviderResult, ProviderRow } from "@/Protocols/ProviderProtocol.ts";

const SEPARATOR = ";";
const EXPECTED_HEADER = ["Tipo Titulo", "Data Vencimento", "Data Base", "Taxa Compra Manha", "Taxa Venda Manha", "PU Compra Manha", "PU Venda Manha", "PU Base Manha"];
const COLUMN_COUNT = EXPECTED_HEADER.length;
const DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/u;
const MAX_FILE_MIB = 50;
const BYTES_PER_MIB = 1_048_576;

export class TesouroAdapter implements ProviderPort<"treasury"> {
  static readonly VENDOR = "tesouro";
  static readonly HOST = "www.tesourotransparente.gov.br";
  // Why: the file holds every bond family from 2004 to the last business day, so one download serves every family of a query.
  static readonly FILE_URL = `https://${TesouroAdapter.HOST}/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv`;
  static readonly MAX_FILE_BYTES = MAX_FILE_MIB * BYTES_PER_MIB;
  static readonly TIMEOUT_MS = 120_000;

  readonly category = "treasury";
  readonly vendor = TesouroAdapter.VENDOR;
  readonly markets = ["TDIR"] as const;
  readonly assetTypes = [] as const;

  private readonly http: HttpPort;
  private readonly url: string;

  constructor(http: HttpPort, url: string = TesouroAdapter.FILE_URL) {
    this.http = http;
    this.url = url;
  }

  async fetchTables(request: ProviderRequest): Promise<ProviderResult> {
    const text = await this.http.getText(this.url);
    const rows = TesouroAdapter.parseFamily(text, request.ticker);
    return { source: TesouroAdapter.VENDOR, tables: { treasury_prices: rows } };
  }

  static parseFamily(text: string, family: string): ProviderRow[] {
    // Why: the ticker of a query is the bond family name the file uses; a family the file does not hold fails with the names it does hold.
    const lines = text.split(/\r?\n/u).filter((line) => line.trim() !== "");
    const header = (lines[0] ?? "").split(SEPARATOR).map((cell) => cell.trim());
    if (header.join("|") !== EXPECTED_HEADER.join("|")) {
      throw new Error("the response format changed: the Tesouro Direto file has another header; no row was written");
    }
    const rows: ProviderRow[] = [];
    const seen = new Set<string>();
    const families = new Set<string>();
    for (const line of lines.slice(1)) {
      const cells = line.split(SEPARATOR);
      if (cells.length !== COLUMN_COUNT) {
        throw new Error(`the response format changed: a Tesouro Direto row has ${cells.length} columns, not ${COLUMN_COUNT}; no row was written`);
      }
      const [bondType = "", maturity = "", baseDate = "", buyRate = "", sellRate = "", buyPrice = "", sellPrice = "", basePrice = ""] = cells;
      families.add(bondType);
      if (bondType !== family) {
        continue;
      }
      const key = `${bondType}|${maturity}|${baseDate}`;
      if (seen.has(key)) {
        throw new Error(`the response format changed: Tesouro Direto has two rows for ${bondType} on ${baseDate}; no row was written`);
      }
      seen.add(key);
      rows.push({
        bond_type: bondType,
        maturity: TesouroAdapter.readIsoDate(maturity, "maturity"),
        base_date: TesouroAdapter.readIsoDate(baseDate, "base date"),
        buy_rate: TesouroAdapter.readNumber(buyRate, "buy rate"),
        sell_rate: TesouroAdapter.readNumber(sellRate, "sell rate"),
        buy_unit_price: TesouroAdapter.readNumber(buyPrice, "buy unit price"),
        sell_unit_price: TesouroAdapter.readNumber(sellPrice, "sell unit price"),
        base_unit_price: TesouroAdapter.readNumber(basePrice, "base unit price"),
        source: TesouroAdapter.VENDOR,
      });
    }
    if (rows.length === 0) {
      const known = [...families].filter((name) => name !== "").sort().join(", ");
      throw new Error(`no Tesouro Direto row for "${family}"; the families in the file are: ${known}`);
    }
    return rows;
  }

  private static readIsoDate(text: string, label: string): string {
    const match = DATE_PATTERN.exec(text.trim());
    if (match === null) {
      throw new Error(`the response format changed: the Tesouro Direto ${label} ${text} is not dd/mm/yyyy; no row was written`);
    }
    const [, day = "", month = "", year = ""] = match;
    return `${year}-${month}-${day}`;
  }

  private static readNumber(text: string, label: string): number | null {
    // Why: the file writes decimals with a comma and no thousands separator; anything else is refused, never read as a guess.
    const trimmed = text.trim();
    if (trimmed === "") {
      return null;
    }
    if (!/^-?\d+(,\d+)?$/u.test(trimmed)) {
      throw new Error(`the response format changed: the Tesouro Direto ${label} ${text} is not a number with a comma; no row was written`);
    }
    return Number(trimmed.replace(",", "."));
  }
}
