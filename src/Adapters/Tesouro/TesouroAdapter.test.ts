import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TesouroAdapter } from "@/Adapters/Tesouro/TesouroAdapter.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";

const FIXTURES = join(import.meta.dirname, "..", "..", "Testing", "fixtures", "tesouro");
const SAMPLE = readFileSync(join(FIXTURES, "precotaxatesourodireto-sample.csv"), "utf8");
const NOT_USED = "not used";
const SELIC = "Tesouro Selic";

const buildHttp = (text: string, urls: string[] = []): HttpPort => ({
  getText: (url: string) => {
    urls.push(url);
    return Promise.resolve(text);
  },
  getBytes: () => Promise.reject(new Error(NOT_USED)),
  postForm: () => Promise.reject(new Error(NOT_USED)),
  getCookies: () => Promise.reject(new Error(NOT_USED)),
});

const HEADER = "Tipo Titulo;Data Vencimento;Data Base;Taxa Compra Manha;Taxa Venda Manha;PU Compra Manha;PU Venda Manha;PU Base Manha";

describe("TesouroAdapter.fetchTables()", () => {
  it("downloads the Tesouro Transparente file and returns the rows of the family asked", async () => {
    const urls: string[] = [];
    const adapter = new TesouroAdapter(buildHttp(SAMPLE, urls));

    const result = await adapter.fetchTables({ market: "TDIR", ticker: SELIC });

    expect(urls).toStrictEqual([TesouroAdapter.FILE_URL]);
    expect(result.source).toBe("tesouro");
    expect(result.tables.treasury_prices).toStrictEqual([
      {
        bond_type: SELIC, maturity: "2027-03-01", base_date: "2026-11-06",
        buy_rate: 0.02, sell_rate: 0.03, buy_unit_price: 20251.05, sell_unit_price: 20240.05, base_unit_price: 20240.05,
        source: "tesouro",
      },
      {
        bond_type: SELIC, maturity: "2031-03-01", base_date: "2026-11-06",
        buy_rate: 0.11, sell_rate: 0.12, buy_unit_price: 20160.62, sell_unit_price: 20141.61, base_unit_price: 20141.61,
        source: "tesouro",
      },
    ]);
  });

  it("keeps the prefixed rates as percent per year, with the decimal comma read as a point", async () => {
    const adapter = new TesouroAdapter(buildHttp(SAMPLE));

    const result = await adapter.fetchTables({ market: "TDIR", ticker: "Tesouro Prefixado" });

    expect(result.tables.treasury_prices?.[0]).toMatchObject({
      buy_rate: 15.09, sell_rate: 15.21, buy_unit_price: 560.82,
    });
  });

  it("names the families the file holds when the family asked is not in it", async () => {
    const adapter = new TesouroAdapter(buildHttp(SAMPLE));

    await expect(adapter.fetchTables({ market: "TDIR", ticker: "Tesouro Inexistente" })).rejects.toThrow(
      /no Tesouro Direto row for "Tesouro Inexistente"; the families in the file are: .*Tesouro Selic/u,
    );
  });

  it("refuses a file whose header changed, and writes nothing", async () => {
    const changed = SAMPLE.replace("Taxa Compra Manha", "Taxa Compra");
    const adapter = new TesouroAdapter(buildHttp(changed));

    await expect(adapter.fetchTables({ market: "TDIR", ticker: SELIC })).rejects.toThrow(
      "the response format changed: the Tesouro Direto file has another header; no row was written",
    );
  });

  it("refuses a number with a thousands point, which it would read as a wrong value", async () => {
    const text = `${HEADER}\n${SELIC};01/03/2027;06/11/2026;0,02;0,03;20.251,05;20240,05;20240,05`;
    const adapter = new TesouroAdapter(buildHttp(text));

    await expect(adapter.fetchTables({ market: "TDIR", ticker: SELIC })).rejects.toThrow(
      "the response format changed: the Tesouro Direto buy unit price 20.251,05 is not a number with a comma; no row was written",
    );
  });

  it("refuses two rows of one bond on one base date", async () => {
    const row = `${SELIC};01/03/2027;06/11/2026;0,02;0,03;20251,05;20240,05;20240,05`;
    const adapter = new TesouroAdapter(buildHttp(`${HEADER}\n${row}\n${row}`));

    await expect(adapter.fetchTables({ market: "TDIR", ticker: SELIC })).rejects.toThrow(
      "the response format changed: Tesouro Direto has two rows for Tesouro Selic on 06/11/2026; no row was written",
    );
  });

  it("refuses a date that is not dd/mm/yyyy", async () => {
    const text = `${HEADER}\n${SELIC};2027-03-01;06/11/2026;0,02;0,03;20251,05;20240,05;20240,05`;
    const adapter = new TesouroAdapter(buildHttp(text));

    await expect(adapter.fetchTables({ market: "TDIR", ticker: SELIC })).rejects.toThrow(
      "the response format changed: the Tesouro Direto maturity 2027-03-01 is not dd/mm/yyyy; no row was written",
    );
  });
});
