import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TesouroAdapter } from "@/Adapters/Tesouro/TesouroAdapter.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";

const FIXTURES = join(import.meta.dirname, "..", "..", "Testing", "fixtures", "tesouro");
const SAMPLE = readFileSync(join(FIXTURES, "precotaxatesourodireto-sample.csv"), "utf8");
const NOT_USED = "not used";
// Why: a query names one bond by its code, the family and the maturity; the guard passes the code normalised, in capitals.
const SELIC_2027 = "TESOURO_SELIC_2027-03-01";
const SELIC_2027_ASSET = "BR:treasury:TESOURO_SELIC_2027-03-01";
const BASE_DATE = "2026-11-06";

const buildHttp = (text: string, urls: string[] = []): HttpPort => ({
  getText: (url: string) => {
    urls.push(url);
    return Promise.resolve(text);
  },
  getBytes: () => Promise.reject(new Error(NOT_USED)),
  postForm: () => Promise.reject(new Error(NOT_USED)),
  downloadToFile: () => Promise.reject(new Error("not used")),
  getCookies: () => Promise.reject(new Error(NOT_USED)),
});

const HEADER = "Tipo Titulo;Data Vencimento;Data Base;Taxa Compra Manha;Taxa Venda Manha;PU Compra Manha;PU Venda Manha;PU Base Manha";

describe("TesouroAdapter.fetchTables()", () => {
  it("downloads the Tesouro Transparente file and returns the prices of the bond asked, one row per metric", async () => {
    const urls: string[] = [];
    const adapter = new TesouroAdapter(buildHttp(SAMPLE, urls));

    const result = await adapter.fetchTables({ market: "BR", assetType: "treasury", ticker: SELIC_2027 });
    const readMetric = (name: string, unit: string, value: number): unknown => ({
      asset_id: SELIC_2027_ASSET, metric: name,
      reference_time_start: BASE_DATE, reference_time_end: BASE_DATE, value, unit,
    });

    expect(urls).toStrictEqual([TesouroAdapter.FILE_URL]);
    expect(result.tables.asset_metrics).toStrictEqual([
      readMetric("treasury.buy_rate", "percent_per_year", 0.02),
      readMetric("treasury.sell_rate", "percent_per_year", 0.03),
      readMetric("treasury.buy_unit_price", "brl", 20251.05),
      readMetric("treasury.sell_unit_price", "brl", 20240.05),
      readMetric("treasury.base_unit_price", "brl", 20240.05),
    ]);
  });

  it("keeps the prefixed rates as percent per year, with the decimal comma read as a point", async () => {
    const adapter = new TesouroAdapter(buildHttp(SAMPLE));

    const result = await adapter.fetchTables({ market: "BR", assetType: "treasury", ticker: "TESOURO_PREFIXADO_2031-01-01" });

    expect(result.tables.asset_metrics).toContainEqual(expect.objectContaining({ metric: "treasury.buy_rate", value: 15.09 }));
    expect(result.tables.asset_metrics).toContainEqual(expect.objectContaining({ metric: "treasury.sell_rate", value: 15.21 }));
    expect(result.tables.asset_metrics).toContainEqual(expect.objectContaining({ metric: "treasury.buy_unit_price", value: 560.82 }));
  });

  it("names the families the file holds when the family asked is not in it", async () => {
    const adapter = new TesouroAdapter(buildHttp(SAMPLE));

    await expect(adapter.fetchTables({ market: "BR", assetType: "treasury", ticker: "TESOURO_INEXISTENTE_2027-03-01" })).rejects.toThrow(
      /no Tesouro Direto row for TESOURO_INEXISTENTE 2027-03-01; the families in the file are: .*Tesouro Selic/u,
    );
  });

  it("refuses a code that is not FAMILY_YYYY-MM-DD, without a request", async () => {
    const urls: string[] = [];
    const adapter = new TesouroAdapter(buildHttp(SAMPLE, urls));

    await expect(adapter.fetchTables({ market: "BR", assetType: "treasury", ticker: "SELIC" })).rejects.toThrow("is not FAMILY_YYYY-MM-DD");
    expect(urls).toStrictEqual([]);
  });

  it("refuses a file whose header changed, and writes nothing", async () => {
    const changed = SAMPLE.replace("Taxa Compra Manha", "Taxa Compra");
    const adapter = new TesouroAdapter(buildHttp(changed));

    await expect(adapter.fetchTables({ market: "BR", assetType: "treasury", ticker: SELIC_2027 })).rejects.toThrow(
      "the response format changed: the Tesouro Direto file has another header; no row was written",
    );
  });

  it("refuses a number with a thousands point, which it would read as a wrong value", async () => {
    const text = `${HEADER}\nTesouro Selic;01/03/2027;06/11/2026;0,02;0,03;20.251,05;20240,05;20240,05`;
    const adapter = new TesouroAdapter(buildHttp(text));

    await expect(adapter.fetchTables({ market: "BR", assetType: "treasury", ticker: SELIC_2027 })).rejects.toThrow(
      "the response format changed: the Tesouro Direto buy unit price 20.251,05 is not a number with a comma; no row was written",
    );
  });

  it("refuses two rows of one bond on one base date", async () => {
    const row = "Tesouro Selic;01/03/2027;06/11/2026;0,02;0,03;20251,05;20240,05;20240,05";
    const adapter = new TesouroAdapter(buildHttp(`${HEADER}\n${row}\n${row}`));

    await expect(adapter.fetchTables({ market: "BR", assetType: "treasury", ticker: SELIC_2027 })).rejects.toThrow(
      "the response format changed: Tesouro Direto has two rows for Tesouro Selic on 06/11/2026; no row was written",
    );
  });

  it("refuses a date that is not dd/mm/yyyy", async () => {
    const text = `${HEADER}\nTesouro Selic;2027-03-01;06/11/2026;0,02;0,03;20251,05;20240,05;20240,05`;
    const adapter = new TesouroAdapter(buildHttp(text));

    await expect(adapter.fetchTables({ market: "BR", assetType: "treasury", ticker: SELIC_2027 })).rejects.toThrow(
      "the response format changed: the Tesouro Direto maturity 2027-03-01 is not dd/mm/yyyy; no row was written",
    );
  });
});
