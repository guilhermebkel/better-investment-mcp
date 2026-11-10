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
const AS_PUBLISHED = "as_published";
const NET_REVENUE = "fundamental.net_revenue";
const END_2024 = "2024-12-31";
const PETR4_ASSET = "BR:stock:PETR4";
const JAN_2024 = "2024-01-01";
const FEB_2024 = "2024-02-01";
const NET_WORTH = "fii.net_worth";
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
    downloadToFile: () => Promise.reject(new Error("not used")),
    getCookies: () => Promise.reject(new Error("not used")),
  };
  return { http, calls };
};

const buildHttpFailing = (error: Error): HttpPort => ({
  getText: () => Promise.reject(error),
  getBytes: () => Promise.reject(error),
  postForm: () => Promise.reject(error),
  downloadToFile: () => Promise.reject(new Error("not used")),
  getCookies: () => Promise.reject(new Error("not used")),
});

describe("StatusInvestAdapter.fetchTables()", () => {
  it("fills one metric row per year and indicator, and keeps a missing value null (AC2, AC6)", async () => {
    const indicators = readFixture("indicatorhistorical-petr4.json");
    const { http } = buildHttpAnswering({ "/acao/indicatorhistorical": () => Promise.resolve(indicators) });
    const result = await new StatusInvestAdapter("fundamentals", http, NO_PAUSE).fetchTables(STOCK);

    expect(result.source).toBe("statusinvest");
    expect(result.tables.asset_metrics).toStrictEqual([
      {
        asset_id: PETR4_ASSET,
        metric: NET_REVENUE,
        reference_time_start: JAN_2024,
        reference_time_end: END_2024,
        value: 300.5,
        unit: AS_PUBLISHED,
      },
      {
        asset_id: PETR4_ASSET,
        metric: NET_REVENUE,
        reference_time_start: "2023-01-01",
        reference_time_end: "2023-12-31",
        value: null,
        unit: AS_PUBLISHED,
      },
      {
        asset_id: PETR4_ASSET,
        metric: "fundamental.net_income",
        reference_time_start: JAN_2024,
        reference_time_end: END_2024,
        value: 100,
        unit: AS_PUBLISHED,
      },
    ]);
  });

  it("reads the number of each rank from value, and a rank without a number is null", async () => {
    // Why: the ranks are the shape the site sends (the sample of the P/L indicator, 2026 ATUAL and 2009, and the dividend yield with no number).
    const indicators = JSON.stringify({
      data: [
        {
          key: "p_l",
          ranks: [
            { timeType: 1, rank: 2026, rank_F: "ATUAL", value: -1.1955, value_F: "-1,20", rankN: 2026001 },
            { timeType: 0, rank: 2009, rank_F: "2009", value_F: "-", rankN: 2009000 },
          ],
        },
        { key: "dy", ranks: [{ timeType: 0, rank: 2025, rank_F: "2025", value_F: "-%", rankN: 2025000 }] },
      ],
    });
    const { http } = buildHttpAnswering({ "/acao/indicatorhistorical": () => Promise.resolve(indicators) });
    const result = await new StatusInvestAdapter("fundamentals", http, NO_PAUSE).fetchTables(STOCK);

    expect(result.itemErrors).toBeUndefined();
    expect(result.tables.asset_metrics?.map((row) => [row.metric, row.reference_time_start, row.value])).toStrictEqual([
      ["fundamental.p_l", "2026-01-01", -1.1955],
      ["fundamental.p_l", "2009-01-01", null],
      ["fundamental.dy", "2025-01-01", null],
    ]);
  });

  it("skips a value that is not a number, names it, and stores the other indicators and years", async () => {
    const indicators = JSON.stringify({
      data: [
        { key: "net_revenue", ranks: [{ rank: 2024, value: "300,5" }, { rank: 2023, value: null }] },
        { key: "net_income", ranks: [{ rank: 2024, value: 100 }] },
      ],
    });
    const { http } = buildHttpAnswering({ "/acao/indicatorhistorical": () => Promise.resolve(indicators) });
    const result = await new StatusInvestAdapter("fundamentals", http, NO_PAUSE).fetchTables(STOCK);

    expect(result.itemErrors).toStrictEqual([
      "fundamental.net_revenue 2024 was not stored: the response format changed: the field value is not a number; no row was written",
    ]);
    expect(result.tables.asset_metrics).toStrictEqual([
      {
        asset_id: PETR4_ASSET,
        metric: NET_REVENUE,
        reference_time_start: "2023-01-01",
        reference_time_end: "2023-12-31",
        value: null,
        unit: AS_PUBLISHED,
      },
      {
        asset_id: PETR4_ASSET,
        metric: "fundamental.net_income",
        reference_time_start: JAN_2024,
        reference_time_end: END_2024,
        value: 100,
        unit: AS_PUBLISHED,
      },
    ]);
  });

  it("names the failure when the response lacks the shape the adapter reads (AC4)", async () => {
    const { http } = buildHttpAnswering({ "/acao/indicatorhistorical": () => Promise.resolve("{\"data\":[{\"ranks\":[]}]}") });
    await expect(new StatusInvestAdapter("fundamentals", http, NO_PAUSE).fetchTables(STOCK))
      .rejects.toThrow("the response format changed");
  });

  it("joins the four sections by month, with the documented columns (AC3)", async () => {
    const { http } = buildHttpAnswering({
      [provents]: () => Promise.resolve(readFixture("companytickerprovents-knri11.json")),
      [receitas]: () => Promise.resolve(readFixture("getreceitas-knri11.json")),
      [despesas]: () => Promise.resolve(readFixture("getdespesas-knri11.json")),
      [caixa]: () => Promise.resolve(readFixture("getcaixa-knri11.json")),
      [patrimonio]: () => Promise.resolve(readFixture("getpatrimonioliquido-knri11.json")),
    });
    const result = await new StatusInvestAdapter("fund_data", http, NO_PAUSE).fetchTables(FII);
    const readMetricAt = (metric: string, month: string): Record<string, unknown> | undefined => {
      const rows = result.tables.asset_metrics ?? [];
      return rows.find((row) => row.metric === metric && row.reference_time_start === month);
    };

    expect(new Set((result.tables.asset_metrics ?? []).map((row) => row.reference_time_start)).size).toBe(2);
    expect(readMetricAt("fii.distribution_per_unit", JAN_2024)).toMatchObject({ asset_id: "BR:fii:KNRI11", value: 1, unit: "brl" });
    expect(readMetricAt("fii.rental_revenue", JAN_2024)).toMatchObject({ value: 10 });
    expect(readMetricAt("fii.total_revenue", JAN_2024)).toMatchObject({ value: 11 });
    expect(readMetricAt("fii.management_fee", JAN_2024)).toMatchObject({ value: 1 });
    expect(readMetricAt("fii.liquidity_requirement", JAN_2024)).toMatchObject({ value: 5 });
    expect(readMetricAt("fii.cash_available", JAN_2024)).toMatchObject({ value: 2 });
    expect(readMetricAt(NET_WORTH, JAN_2024)).toMatchObject({ value: 1000 });
    expect(readMetricAt("fii.distribution_per_unit", FEB_2024)).toMatchObject({ value: 1 });
    expect(readMetricAt("fii.property_sales_revenue", FEB_2024)).toMatchObject({ value: 2 });
    expect(readMetricAt(NET_WORTH, FEB_2024)).toMatchObject({ value: 1010 });
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
    expect(result.tables.asset_metrics?.find((row) => row.metric === NET_WORTH)).toMatchObject({ value: null });
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
    expect(result.tables.asset_metrics).toHaveLength(3);
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
    expect(result.tables.asset_metrics?.find((row) => row.metric === "fii.rental_revenue")).toMatchObject({ value: null });
    expect(result.tables.asset_metrics?.find((row) => row.metric === "fii.total_revenue")).toMatchObject({ value: 0 });
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
