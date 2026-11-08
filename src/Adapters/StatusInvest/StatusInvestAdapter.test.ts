import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HttpFailureError } from "@/Errors/HttpFailureError.ts";
import { StatusInvestAdapter } from "@/Adapters/StatusInvest/StatusInvestAdapter.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";

// Why: these fixtures are written from the field list of issue #8, not recorded from the site, because the site refused the requests from the test environment.
const FIXTURES = join(import.meta.dirname, "..", "..", "Testing", "fixtures", "statusinvest");
const NOT_USED = "not used";
const provents = "/fii/companytickerprovents";
const receitas = "/fii/getreceitas";
const despesas = "/fii/getdespesas";
const caixa = "/fii/getcaixa";
const patrimonio = "/fii/getpatrimonioliquido";
const FORBIDDEN_403 = "the vendor answered with status 403";
const EMPTY_MONTHS = "{\"listMonth\":[]}";
const STOCK = { market: "BR", ticker: "PETR4", assetType: "stock" };
const FII = { market: "BR", ticker: "KNRI11", assetType: "fii" };
const NO_PAUSE = { pause: () => Promise.resolve(), pauseMs: 0 };

const readFixture = (name: string): string => readFileSync(join(FIXTURES, name), "utf8");

type Answer = () => Promise<string>;

const buildHttpAnswering = (pathToAnswer: Readonly<Record<string, Answer>>): {
  http: HttpPort;
  calls: string[];
} => {
  const calls: string[] = [];
  const resolveRoute = (url: string): Promise<string> => {
    calls.push(url);
    const path = Object.keys(pathToAnswer).find((candidate) => url.includes(candidate));
    if (path === undefined) {
      return Promise.reject(new HttpFailureError("the vendor answered with status 404", 404));
    }
    return pathToAnswer[path]?.() ?? Promise.reject(new Error(NOT_USED));
  };
  const http: HttpPort = {
    getText: resolveRoute,
    getBytes: () => Promise.reject(new Error(NOT_USED)),
    postForm: resolveRoute,
    getCookies: () => Promise.reject(new Error("not used")),
  };
  return { http, calls };
};

const buildHttpFailing = (error: Error): HttpPort => ({
  getText: () => Promise.reject(error),
  getBytes: () => Promise.reject(error),
  postForm: () => Promise.reject(error),
  getCookies: () => Promise.reject(new Error("not used")),
});

describe("StatusInvestAdapter.fetchTables()", () => {
  it("fills one row per year and metric with source statusinvest, and keeps a missing value null (AC2, AC6)", async () => {
    const indicators = readFixture("indicatorhistorical-petr4.json");
    const { http } = buildHttpAnswering({ "/acao/indicatorhistorical": () => Promise.resolve(indicators) });
    const result = await new StatusInvestAdapter("fundamentals", http, NO_PAUSE).fetchTables(STOCK);

    expect(result.source).toBe("statusinvest");
    expect(result.tables.fundamentals).toStrictEqual([
      { market: "BR", ticker: "PETR4", asset_type: "stock", year: 2024, metric: "net_revenue", value: 300.5, source: "statusinvest" },
      { market: "BR", ticker: "PETR4", asset_type: "stock", year: 2023, metric: "net_revenue", value: null, source: "statusinvest" },
      { market: "BR", ticker: "PETR4", asset_type: "stock", year: 2024, metric: "net_income", value: 100, source: "statusinvest" },
    ]);
  });

  it("names the failure when the response lacks the shape the adapter reads (AC4)", async () => {
    const { http } = buildHttpAnswering({ "/acao/indicatorhistorical": () => Promise.resolve("{\"data\":[{\"ranks\":[]}]}") });
    await expect(new StatusInvestAdapter("fundamentals", http, NO_PAUSE).fetchTables(STOCK))
      .rejects.toThrow("the response format changed");
  });

  it("joins the four sections by month, with the documented columns and source statusinvest (AC3)", async () => {
    const { http } = buildHttpAnswering({
      [provents]: () => Promise.resolve(readFixture("companytickerprovents-knri11.json")),
      [receitas]: () => Promise.resolve(readFixture("getreceitas-knri11.json")),
      [despesas]: () => Promise.resolve(readFixture("getdespesas-knri11.json")),
      [caixa]: () => Promise.resolve(readFixture("getcaixa-knri11.json")),
      [patrimonio]: () => Promise.resolve(readFixture("getpatrimonioliquido-knri11.json")),
    });
    const result = await new StatusInvestAdapter("fund_data", http, NO_PAUSE).fetchTables(FII);
    const [january, february] = result.tables.fii_monthly ?? [];

    expect(result.tables.fii_monthly).toHaveLength(2);
    expect(january).toMatchObject({
      market: "BR", ticker: "KNRI11", asset_type: "fii", period: "2024-01-01",
      distribution_per_unit: 1, rental_revenue: 10, total_revenue: 11, management_fee: 1,
      liquidity_requirement: 5, cash_available: 2, net_worth: 1000, source: "statusinvest",
    });
    expect(february).toMatchObject({ period: "2024-02-01", distribution_per_unit: 1, property_sales_revenue: 2, net_worth: 1010 });
  });

  it("leaves net worth null for a month the net worth section does not cover (AC6)", async () => {
    const { http } = buildHttpAnswering({
      [provents]: () => Promise.resolve(readFixture("companytickerprovents-knri11.json")),
      [receitas]: () => Promise.resolve(readFixture("getreceitas-knri11.json")),
      [despesas]: () => Promise.resolve(readFixture("getdespesas-knri11.json")),
      [caixa]: () => Promise.resolve(readFixture("getcaixa-knri11.json")),
      [patrimonio]: () => Promise.resolve(EMPTY_MONTHS),
    });
    const result = await new StatusInvestAdapter("fund_data", http, NO_PAUSE).fetchTables(FII);
    expect(result.tables.fii_monthly?.[0]).toMatchObject({ net_worth: null });
  });

  it("retries a 403 and keeps the data when the retry passes (AC5)", async () => {
    let attempts = 0;
    const pauses: number[] = [];
    const http: HttpPort = {
      ...buildHttpFailing(new Error(NOT_USED)),
      postForm: () => {
        attempts++;
        return attempts === 1
          ? Promise.reject(new HttpFailureError(FORBIDDEN_403, 403))
          : Promise.resolve(readFixture("indicatorhistorical-petr4.json"));
      },
    };
    const recordPause = (ms: number): Promise<void> => {
      pauses.push(ms);
      return Promise.resolve();
    };
    const result = await new StatusInvestAdapter("fundamentals", http, { pause: recordPause, pauseMs: 1000 }).fetchTables(STOCK);
    expect(attempts).toBe(2);
    expect(result.tables.fundamentals).toHaveLength(3);
    expect(pauses).toStrictEqual([1000, 5000]);
  });

  it("gives up after two 403 retries and says the site blocks the client (AC5)", async () => {
    let attempts = 0;
    const http: HttpPort = {
      ...buildHttpFailing(new Error(NOT_USED)),
      postForm: () => {
        attempts++;
        return Promise.reject(new HttpFailureError(FORBIDDEN_403, 403));
      },
    };
    await expect(new StatusInvestAdapter("fundamentals", http, NO_PAUSE).fetchTables(STOCK))
      .rejects.toThrow("StatusInvest blocks this client (status 403)");
    expect(attempts).toBe(3);
  });

  it("keeps a missing monthly value null, never zero (AC6)", async () => {
    const zeroMonth = "{\"listMonth\":[{\"month\":3,\"year\":2024,\"receitalaluguel\":null,\"receitavendaimovel\":0,\"receitaoutras\":0,\"receitatotal\":0}]}";
    const expenses = "{\"listMonth\":[{\"month\":3,\"year\":2024,\"rendimentosdistribuir\":0,\"taxaadministracao\":0,\"taxaperformance\":0,\"aquisicoesimoveis\":0,\"outrasdespesas\":0,\"totaldespesas\":0}]}";
    const cash = "{\"listMonth\":[{\"month\":3,\"year\":2024,\"totalnecessidadeliquidez\":0,\"disponibilidades\":0,\"titulospublicos\":0,\"titulosprivados\":0,\"fundosrendafixa\":0}]}";
    const { http } = buildHttpAnswering({
      [provents]: () => Promise.resolve(EMPTY_MONTHS.replace("listMonth", "assetEarningsModels")),
      [receitas]: () => Promise.resolve(zeroMonth),
      [despesas]: () => Promise.resolve(expenses),
      [caixa]: () => Promise.resolve(cash),
      [patrimonio]: () => Promise.resolve(EMPTY_MONTHS),
    });
    const result = await new StatusInvestAdapter("fund_data", http, NO_PAUSE).fetchTables(FII);
    expect(result.tables.fii_monthly?.[0]).toMatchObject({ rental_revenue: null, total_revenue: 0 });
  });

  it("names the field when a monthly section lacks a mapped field (AC4)", async () => {
    const { http } = buildHttpAnswering({
      [provents]: () => Promise.resolve("{\"assetEarningsModels\":[]}"),
      [receitas]: () => Promise.resolve("{\"listMonth\":[{\"month\":1,\"year\":2024,\"receitalaluguel\":1}]}"),
    });
    await expect(new StatusInvestAdapter("fund_data", http, NO_PAUSE).fetchTables(FII))
      .rejects.toThrow("getreceitas has no field receitavendaimovel");
  });

  it("says the site blocks the client when it answers 403 (AC5)", async () => {
    const http = buildHttpFailing(new HttpFailureError(FORBIDDEN_403, 403));
    await expect(new StatusInvestAdapter("fundamentals", http, NO_PAUSE).fetchTables(STOCK))
      .rejects.toThrow("StatusInvest blocks this client (status 403)");
  });

  it("waits between calls, one pause for each request", async () => {
    const pauses: number[] = [];
    const { http, calls } = buildHttpAnswering({
      [provents]: () => Promise.resolve("{\"assetEarningsModels\":[]}"),
      [receitas]: () => Promise.resolve(EMPTY_MONTHS),
      [despesas]: () => Promise.resolve(EMPTY_MONTHS),
      [caixa]: () => Promise.resolve(EMPTY_MONTHS),
      [patrimonio]: () => Promise.resolve(EMPTY_MONTHS),
    });
    const recordPause = (ms: number): Promise<void> => {
      pauses.push(ms);
      return Promise.resolve();
    };
    await new StatusInvestAdapter("fund_data", http, { pause: recordPause, pauseMs: 1000 }).fetchTables(FII);
    expect(calls).toHaveLength(5);
    expect(pauses).toStrictEqual([1000, 1000, 1000, 1000, 1000]);
  });

  it("serves only the asset types of its category", () => {
    const { http } = buildHttpAnswering({});
    expect(new StatusInvestAdapter("fundamentals", http, NO_PAUSE).assetTypes).toStrictEqual(["stock"]);
    expect(new StatusInvestAdapter("fund_data", http, NO_PAUSE).assetTypes).toStrictEqual(["fii"]);
  });
});
