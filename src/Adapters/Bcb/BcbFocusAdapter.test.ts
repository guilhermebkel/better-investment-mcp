import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BcbFocusAdapter } from "@/Adapters/Bcb/BcbFocusAdapter.ts";
import { HttpFailureError } from "@/Errors/HttpFailureError.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";

const FIXTURES = join(import.meta.dirname, "..", "..", "Testing", "fixtures", "bcb");
const readFixture = (name: string): string => readFileSync(join(FIXTURES, name), "utf8");
const NOT_USED = "not used";
const FIXTURE_NAME = "olinda-focus-ipca-sample.json";
const YEAR_2014_START = "2014-01-01";
const IPCA_ASSET = "BR:index:IPCA";
const YEAR_2000_START = "2000-01-01";
const YEAR_2000_END = "2000-12-31";

const buildHttp = (answer: () => Promise<string>, urls: string[] = []): HttpPort => ({
  getText: (url: string) => {
    urls.push(url);
    return answer();
  },
  getBytes: () => Promise.reject(new Error(NOT_USED)),
  postForm: () => Promise.reject(new Error(NOT_USED)),
  downloadToFile: () => Promise.reject(new Error("not used")),
  getCookies: () => Promise.reject(new Error(NOT_USED)),
});

describe("BcbFocusAdapter.fetchTables()", () => {
  it("keeps the four annual indicators under the asset codes a query uses", () => {
    expect(BcbFocusAdapter.INDICATORS.map((indicator) => indicator.code)).toStrictEqual(["IPCA", "SELIC", "PIB_TOTAL", "USD"]);
  });

  it("asks the Olinda service for one indicator by its name, in JSON", async () => {
    const urls: string[] = [];
    const adapter = new BcbFocusAdapter(buildHttp(() => Promise.resolve(readFixture(FIXTURE_NAME)), urls));

    await adapter.fetchTables({ market: "BR", assetType: "index", ticker: "IPCA" });

    expect(urls).toStrictEqual([
      "https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais?$filter=Indicador%20eq%20'IPCA'&$format=json",
    ]);
  });

  it("fills market_expectations from the recorded answer, keeping the nulls of the old surveys", async () => {
    const adapter = new BcbFocusAdapter(buildHttp(() => Promise.resolve(readFixture(FIXTURE_NAME))));

    const result = await adapter.fetchTables({ market: "BR", assetType: "index", ticker: "IPCA" });

    expect(result.source).toBe("bcb");
    expect(result.tables.asset_expectations).toStrictEqual([
      {
        asset_id: IPCA_ASSET, reference_time_start: YEAR_2000_START, reference_time_end: YEAR_2000_END, survey_time: "2000-01-03", calculation_base: 0,
        mean: 7, median: 7, std_dev: 0.8, min: null, max: null, respondents: null,
      },
      {
        asset_id: IPCA_ASSET, reference_time_start: YEAR_2000_START, reference_time_end: YEAR_2000_END, survey_time: "2000-01-04", calculation_base: 0,
        mean: 7, median: 7, std_dev: 0.79, min: null, max: null, respondents: null,
      },
      {
        asset_id: IPCA_ASSET, reference_time_start: YEAR_2014_START, reference_time_end: "2014-12-31", survey_time: "2014-01-02", calculation_base: 1,
        mean: 5.89, median: 5.9, std_dev: 0.3, min: 5.15, max: 6.54, respondents: 27,
      },
    ]);
  });

  it("returns only the reference years of the requested period", async () => {
    const adapter = new BcbFocusAdapter(buildHttp(() => Promise.resolve(readFixture(FIXTURE_NAME))));
    const result = await adapter.fetchTables({
      market: "BR", assetType: "index", ticker: "IPCA", period: { from: YEAR_2014_START, to: "2014-12-31" },
    });

    expect(result.tables.asset_expectations?.map((row) => row.reference_time_start)).toStrictEqual([YEAR_2014_START]);
  });

  it("refuses an indicator that is not one of the four codes, without a request", async () => {
    const urls: string[] = [];
    const adapter = new BcbFocusAdapter(buildHttp(() => Promise.resolve("{}"), urls));

    await expect(adapter.fetchTables({ market: "BR", assetType: "index", ticker: "INFLACAO" })).rejects.toThrow(
      "unknown Focus indicator INFLACAO; the known indicators are IPCA, SELIC, PIB_TOTAL, USD",
    );
    expect(urls).toStrictEqual([]);
  });

  it("refuses an answer about another indicator", async () => {
    const other = readFixture(FIXTURE_NAME).replaceAll("\"IPCA\"", "\"Selic\"");
    const adapter = new BcbFocusAdapter(buildHttp(() => Promise.resolve(other)));

    await expect(adapter.fetchTables({ market: "BR", assetType: "index", ticker: "IPCA" })).rejects.toThrow(
      "the response format changed: the Focus service sent Selic for ipca; no row was written",
    );
  });

  it("refuses a row that carries a detail, which the table has no column for", async () => {
    const withDetail = readFixture(FIXTURE_NAME).replace("\"IndicadorDetalhe\": null", "\"IndicadorDetalhe\": \"Exportações\"");
    const adapter = new BcbFocusAdapter(buildHttp(() => Promise.resolve(withDetail)));

    await expect(adapter.fetchTables({ market: "BR", assetType: "index", ticker: "IPCA" })).rejects.toThrow(
      "the response format changed: the Focus service sent a detail for ipca; no row was written",
    );
  });

  it("refuses an error body instead of JSON rows", async () => {
    const adapter = new BcbFocusAdapter(buildHttp(() => Promise.resolve("/*{\"codigo\":500}*/")));

    await expect(adapter.fetchTables({ market: "BR", assetType: "tax_rate", ticker: "SELIC" })).rejects.toThrow(
      "the response format changed: the Focus service did not send JSON for selic; no row was written",
    );
  });

  it("names the rate limit so the run is retried later", async () => {
    const adapter = new BcbFocusAdapter(buildHttp(() => Promise.reject(new HttpFailureError("rate limit (status 429)", 429))));

    await expect(adapter.fetchTables({ market: "BR", assetType: "tax_rate", ticker: "SELIC" })).rejects.toThrow(
      "the Focus service answered with a rate limit for selic; the run is recorded and the next load retries",
    );
  });
});
