import { describe, expect, it } from "vitest";
import { BcbIfDataAdapter } from "@/Adapters/Bcb/BcbIfDataAdapter.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";

const NOT_USED = "not used";
const LEADER_ROOT = "60701190";
const CNPJ = "60.701.190/0001-04";
const OTHER_CNPJ = "33.000.167/0001-01";
const MARKET = "BR";
const TICKER = "ITUB4";
const ASSET_ID = "BR:stock:ITUB4";
const FROM = "2025-06-01";
const TO = "2025-09-30";
const QUARTER_START = "2025-07-01";
const QUARTER_END = "2025-09-30";
const PUBLISHED_QUARTER = "202506";
const UNPUBLISHED_QUARTER = "202509";
const TOTAL_ACCOUNT = "140220";
const CREDIT_ACCOUNT = "140205";
const REGISTRY = {
  value: [
    { CodInst: "C1", CnpjInstituicaoLider: LEADER_ROOT, NomeInstituicao: "BANCO A" },
    { CodInst: "C2", CnpjInstituicaoLider: "99999999", NomeInstituicao: "BANCO B" },
    { CodInst: "C3", CnpjInstituicaoLider: null, NomeInstituicao: "BANCO C" },
  ],
};
const TOTAL_ASSETS = { value: [{ CodInst: "C1", Conta: TOTAL_ACCOUNT, Saldo: 300 }, { CodInst: "C2", Conta: TOTAL_ACCOUNT, Saldo: 600 }, { CodInst: "C3", Conta: TOTAL_ACCOUNT, Saldo: 100 }] };
const CREDIT = { value: [{ CodInst: "C1", Conta: CREDIT_ACCOUNT, Saldo: 50 }, { CodInst: "C2", Conta: CREDIT_ACCOUNT, Saldo: 150 }, { CodInst: "C3", Conta: CREDIT_ACCOUNT, Saldo: null }] };
const ACCOUNT_TO_ANSWER: Record<string, unknown> = { [TOTAL_ACCOUNT]: TOTAL_ASSETS, [CREDIT_ACCOUNT]: CREDIT };
const EMPTY = JSON.stringify({ value: [] });

const buildHttp = (served: readonly string[] = [PUBLISHED_QUARTER, "202509"]): HttpPort => ({
  getText: (url: string) => {
    const month = /AnoMes=(\d{6})/u.exec(url)?.[1] ?? "";
    if (!served.includes(month)) {
      return Promise.resolve(EMPTY);
    }
    if (url.includes("IfDataCadastro")) {
      return Promise.resolve(JSON.stringify(REGISTRY));
    }
    const account = /Conta%20eq%20'(\d+)'/u.exec(url)?.[1] ?? "";
    return Promise.resolve(JSON.stringify(ACCOUNT_TO_ANSWER[account]));
  },
  getBytes: () => Promise.reject(new Error(NOT_USED)),
  postForm: () => Promise.reject(new Error(NOT_USED)),
  getCookies: () => Promise.reject(new Error(NOT_USED)),
  downloadToFile: () => Promise.reject(new Error(NOT_USED)),
});

const request = (ticker: string, from?: string, to?: string) => ({
  market: MARKET,
  ticker,
  assetType: "stock",
  ...(from === undefined || to === undefined ? {} : { period: { from, to } }),
});

const fetchFor = (ticker: string, served: readonly string[], cnpj: string | undefined) => {
  const http = buildHttp(served);
  const adapter = new BcbIfDataAdapter(http, () => Promise.resolve(cnpj));
  const req = request(ticker, FROM, TO);
  return adapter.fetchTables(req);
};

const buildMetricRow = (metric: string, value: number, unit: string) => ({
  asset_id: ASSET_ID,
  reference_time_start: QUARTER_START,
  reference_time_end: QUARTER_END,
  metric,
  value,
  unit,
});

describe("BcbIfDataAdapter.fetchTables()", () => {
  it("stores the group's amount and its share of the file, for each quarter of the period (AC17)", async () => {
    const result = await fetchFor(TICKER, [PUBLISHED_QUARTER, UNPUBLISHED_QUARTER], CNPJ);

    const rows = result.tables.asset_metrics ?? [];
    const quarterRows = rows.filter((row) => row.reference_time_start === QUARTER_START);
    expect(quarterRows).toStrictEqual([
      buildMetricRow("banking.total_assets", 300, "brl"),
      buildMetricRow("banking.total_assets_share", 30, "percent"),
      buildMetricRow("banking.credit_portfolio", 50, "brl"),
      buildMetricRow("banking.credit_portfolio_share", 25, "percent"),
    ]);
    const previousStart = "2025-04-01";
    const previousRows = [previousStart, previousStart, previousStart, previousStart];
    const quarterRowsStarts = [QUARTER_START, QUARTER_START, QUARTER_START, QUARTER_START];
    expect(rows.map((row) => row.reference_time_start)).toStrictEqual([...previousRows, ...quarterRowsStarts]);
  });

  it("names a quarter that is not published yet and stores nothing for it", async () => {
    const result = await fetchFor(TICKER, [PUBLISHED_QUARTER], CNPJ);

    expect(result.itemErrors).toStrictEqual([`${UNPUBLISHED_QUARTER} is not published yet; its values are not stored`]);
    expect(result.tables.asset_metrics?.every((row) => row.reference_time_start !== QUARTER_START)).toBe(true);
  });

  it("stores no row for a company whose CNPJ root leads no institution of the file", async () => {
    const result = await fetchFor("PETR4", [PUBLISHED_QUARTER, UNPUBLISHED_QUARTER], OTHER_CNPJ);
    expect(result.tables.asset_metrics).toStrictEqual([]);
  });

  it("fails when the company has no CNPJ, and never guesses one (issue #59, AC20)", async () => {
    const pending = fetchFor("XXXX3", [PUBLISHED_QUARTER, UNPUBLISHED_QUARTER], undefined);
    await expect(pending).rejects.toThrow("has no CNPJ");
  });
});

describe("BcbIfDataAdapter.readQuarterEnds()", () => {
  it("names the quarter ends of a period, and nothing before the first served quarter", () => {
    expect(BcbIfDataAdapter.readQuarterEnds("2025-01-01", "2025-12-31")).toStrictEqual(["202503", "202506", "202509", "202512"]);
    expect(BcbIfDataAdapter.readQuarterEnds("2013-01-01", "2013-06-30")).toStrictEqual(["201303", "201306"]);
  });
});
