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

const buildHttp = (answer: () => Promise<string>, urls: string[] = []): HttpPort => ({
  getText: (url: string) => {
    urls.push(url);
    return answer();
  },
  getBytes: () => Promise.reject(new Error(NOT_USED)),
  postForm: () => Promise.reject(new Error(NOT_USED)),
  getCookies: () => Promise.reject(new Error(NOT_USED)),
});

describe("BcbFocusAdapter.fetchTables()", () => {
  it("keeps the four annual indicators under the keys a query uses", () => {
    expect(BcbFocusAdapter.INDICATORS.map((indicator) => indicator.key)).toStrictEqual(["ipca", "selic", "pib_total", "cambio"]);
  });

  it("asks the Olinda service for one indicator by its name, in JSON", async () => {
    const urls: string[] = [];
    const adapter = new BcbFocusAdapter(buildHttp(() => Promise.resolve(readFixture(FIXTURE_NAME)), urls));

    await adapter.fetchTables({ market: "FOCUS", ticker: "ipca" });

    expect(urls).toStrictEqual([
      "https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais?$filter=Indicador%20eq%20'IPCA'&$format=json",
    ]);
  });

  it("fills market_expectations from the recorded answer, keeping the nulls of the old surveys", async () => {
    const adapter = new BcbFocusAdapter(buildHttp(() => Promise.resolve(readFixture(FIXTURE_NAME))));

    const result = await adapter.fetchTables({ market: "FOCUS", ticker: "ipca" });

    expect(result.source).toBe("bcb");
    expect(result.tables.market_expectations).toStrictEqual([
      {
        indicator: "ipca", reference_year: 2000, survey_date: "2000-01-03", calculation_base: 0,
        mean_value: 7, median_value: 7, std_dev: 0.8, min_value: null, max_value: null, respondents: null, source: "bcb",
      },
      {
        indicator: "ipca", reference_year: 2000, survey_date: "2000-01-04", calculation_base: 0,
        mean_value: 7, median_value: 7, std_dev: 0.79, min_value: null, max_value: null, respondents: null, source: "bcb",
      },
      {
        indicator: "ipca", reference_year: 2014, survey_date: "2014-01-02", calculation_base: 1,
        mean_value: 5.89, median_value: 5.9, std_dev: 0.3, min_value: 5.15, max_value: 6.54, respondents: 27, source: "bcb",
      },
    ]);
  });

  it("refuses an indicator that is not one of the four keys, without a request", async () => {
    const urls: string[] = [];
    const adapter = new BcbFocusAdapter(buildHttp(() => Promise.resolve("{}"), urls));

    await expect(adapter.fetchTables({ market: "FOCUS", ticker: "inflacao" })).rejects.toThrow(
      "unknown Focus indicator inflacao; the known indicators are ipca, selic, pib_total, cambio",
    );
    expect(urls).toStrictEqual([]);
  });

  it("refuses an answer about another indicator", async () => {
    const other = readFixture(FIXTURE_NAME).replaceAll("\"IPCA\"", "\"Selic\"");
    const adapter = new BcbFocusAdapter(buildHttp(() => Promise.resolve(other)));

    await expect(adapter.fetchTables({ market: "FOCUS", ticker: "ipca" })).rejects.toThrow(
      "the response format changed: the Focus service sent Selic for ipca; no row was written",
    );
  });

  it("refuses a row that carries a detail, which the table has no column for", async () => {
    const withDetail = readFixture(FIXTURE_NAME).replace("\"IndicadorDetalhe\": null", "\"IndicadorDetalhe\": \"Exportações\"");
    const adapter = new BcbFocusAdapter(buildHttp(() => Promise.resolve(withDetail)));

    await expect(adapter.fetchTables({ market: "FOCUS", ticker: "ipca" })).rejects.toThrow(
      "the response format changed: the Focus service sent a detail for ipca; no row was written",
    );
  });

  it("refuses an error body instead of JSON rows", async () => {
    const adapter = new BcbFocusAdapter(buildHttp(() => Promise.resolve("/*{\"codigo\":500}*/")));

    await expect(adapter.fetchTables({ market: "FOCUS", ticker: "selic" })).rejects.toThrow(
      "the response format changed: the Focus service did not send JSON for selic; no row was written",
    );
  });

  it("names the rate limit so the run is retried later", async () => {
    const adapter = new BcbFocusAdapter(buildHttp(() => Promise.reject(new HttpFailureError("rate limit (status 429)", 429))));

    await expect(adapter.fetchTables({ market: "FOCUS", ticker: "selic" })).rejects.toThrow(
      "the Focus service answered with a rate limit for selic; the run is recorded and the next load retries",
    );
  });
});
