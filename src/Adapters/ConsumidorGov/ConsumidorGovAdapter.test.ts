import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ConsumidorGovAdapter } from "@/Adapters/ConsumidorGov/ConsumidorGovAdapter.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import type { ProviderRequest, ProviderResult } from "@/Protocols/ProviderProtocol.ts";
import { ZipFixture } from "@/Testing/ZipFixture.ts";

const NOT_USED = "not used";
const MARKET = "BR";
const ASSET_ID = "BR:complaints:ITAU";
const OCTOBER_FROM = "2026-10-01";
const OCTOBER_TO = "2026-10-31";
const BASE = ConsumidorGovAdapter.BASE_URL;
const PUBLICATIONS_URL = `${BASE}/pages/publicacao/externo/publicacoes.json?indicadorTipoPublicacao=2`;
const OCTOBER_ZIP_URL = `${BASE}/pages/publicacao/externo/200/download`;
const SEPTEMBER_ZIP_URL = `${BASE}/pages/publicacao/externo/190/download`;
const HEADER = "regiao;uf;cidade;sexo;faixa_etaria;data_finalizacao;tempo_resposta;nome_fantasia;segmento_de_mercado;area;assunto;grupo_problema;problema;como_comprou_contratou;procurou_empresa;respondida;situacao;avaliacao_reclamacao;nota_do_consumidor";
const BANCO_ITAU = "Banco Itaú Unibanco";
const ITAU_SEGUROS = "Itaú Seguros";
const RATED = "Finalizada avaliada";
const NOT_RATED = "Finalizada não avaliada";
const RESOLVED = "Resolvida";
const NOT_EVALUATED = "Não Avaliada";
const OCTOBER_CSV_NAME = "finalizadas_2026-10.csv";
const SEPTEMBER_CSV_NAME = "finalizadas_2026-09.csv";
const PETROBRAS_TRADE = "Postos Petrobras (Vibra Energia)";
const COMPLAINT_ARGUMENTS_FIXED = ["S", "RS", "Guaíba", "M", "entre 41 a 50 anos", "09/10/2026"];
const COMPLAINT_FILLER = ["x", "x", "x", "x", "x", "x", "x"];

type Complaint = {
  name: string;
  answered: string;
  situation: string;
  outcome: string;
  score: string;
  days: string;
};

const buildLine = (complaint: Complaint): string => {
  const outcomes = [complaint.answered, complaint.situation, complaint.outcome, complaint.score];
  const cells = [...COMPLAINT_ARGUMENTS_FIXED, complaint.days, complaint.name, ...COMPLAINT_FILLER, ...outcomes];
  return cells.join(";");
};

const buildUtf8Text = (text: string): string => {
  // Why: the zip fixture writes each character as one latin-1 byte; the real file is UTF-8, so the text is given to it as its UTF-8 bytes.
  const bytes = Buffer.from(text, "utf8");
  return bytes.toString("latin1");
};

const OCTOBER_CSV = [
  HEADER,
  buildLine({ name: BANCO_ITAU, answered: "Sim", situation: RATED, outcome: RESOLVED, score: "5", days: "2" }),
  buildLine({ name: BANCO_ITAU, answered: "Não", situation: NOT_RATED, outcome: NOT_EVALUATED, score: "", days: "4" }),
  buildLine({ name: ITAU_SEGUROS, answered: "Sim", situation: NOT_RATED, outcome: NOT_EVALUATED, score: "", days: "10" }),
  buildLine({ name: "Loja Online", answered: "Sim", situation: RATED, outcome: RESOLVED, score: "1", days: "1" }),
  buildLine({ name: PETROBRAS_TRADE, answered: "Sim", situation: RATED, outcome: "Não Resolvida", score: "2", days: "3" }),
].join("\n");

const SEPTEMBER_CSV = [
  HEADER,
  buildLine({ name: ITAU_SEGUROS, answered: "Sim", situation: RATED, outcome: RESOLVED, score: "4", days: "6" }),
].join("\n");

const PUBLICATIONS = JSON.stringify([
  { nomeArquivo: "usuarios_consolidados.csv", codigo: "5" },
  { nomeArquivo: "finalizadas_2026-10.zip", codigo: "200" },
  { nomeArquivo: "finalizadas_2026-09.zip", codigo: "190" },
]);

const urlToBytes: Record<string, Uint8Array> = {
  [OCTOBER_ZIP_URL]: ZipFixture.buildZipOf({ [OCTOBER_CSV_NAME]: buildUtf8Text(OCTOBER_CSV) }),
  [SEPTEMBER_ZIP_URL]: ZipFixture.buildZipOf({ [SEPTEMBER_CSV_NAME]: buildUtf8Text(SEPTEMBER_CSV) }),
};

const buildHttp = (urlToFileBytes: Record<string, Uint8Array>, publications: string = PUBLICATIONS): HttpPort => ({
  getText: (url: string) => {
    if (url !== PUBLICATIONS_URL) {
      return Promise.reject(new Error(NOT_USED));
    }
    return Promise.resolve(publications);
  },
  getBytes: () => Promise.reject(new Error(NOT_USED)),
  postForm: () => Promise.reject(new Error(NOT_USED)),
  getCookies: () => Promise.reject(new Error(NOT_USED)),
  downloadToFile: (url: string, filePath: string) => {
    const file = urlToFileBytes[url];
    if (file === undefined) {
      return Promise.reject(new Error(`no fixture for ${url}`));
    }
    writeFileSync(filePath, file);
    return Promise.resolve(file.byteLength);
  },
});

const buildRequest = (ticker: string, from?: string, to?: string): ProviderRequest => {
  const period = from === undefined || to === undefined ? undefined : { from, to };
  return {
    market: MARKET,
    ticker,
    assetType: "complaints",
    ...(period === undefined ? {} : { period }),
  };
};

const fetchFor = (
  ticker: string,
  from?: string,
  to?: string,
  urlToFileBytes: Record<string, Uint8Array> = urlToBytes,
  publications?: string,
): Promise<ProviderResult> => {
  const http = buildHttp(urlToFileBytes, publications);
  const adapter = new ConsumidorGovAdapter(http);
  const request = buildRequest(ticker, from, to);
  return adapter.fetchTables(request);
};

describe("ConsumidorGovAdapter.fetchTables()", () => {
  it("counts each trade name that contains the term, with the definitions of the table (AC9, AC10)", async () => {
    const result = await fetchFor("ITAU", OCTOBER_FROM, OCTOBER_TO);

    expect(result.tables.asset_complaints).toStrictEqual([
      {
        asset_id: ASSET_ID, trade_name: BANCO_ITAU, reference_time_start: OCTOBER_FROM,
        complaint_count: 2, answered: 1, rated: 1, resolved: 1, score_mean: 5, response_days_mean: 3,
      },
      {
        asset_id: ASSET_ID, trade_name: ITAU_SEGUROS, reference_time_start: OCTOBER_FROM,
        complaint_count: 1, answered: 1, rated: 0, resolved: 0, score_mean: null, response_days_mean: 10,
      },
    ]);
  });

  it("matches a term with an underscore as a space and names what matched, without a link to a company (AC12, AC16)", async () => {
    const result = await fetchFor("PETROBRAS", OCTOBER_FROM, OCTOBER_TO);

    expect(result.tables.asset_complaints?.map((row) => row.trade_name)).toStrictEqual([PETROBRAS_TRADE]);
  });

  it("reads the latest published month when no period is given, and one row set per month of a period (AC13, AC14)", async () => {
    const latest = await fetchFor("ITAU");
    expect(latest.tables.asset_complaints?.every((row) => row.reference_time_start === OCTOBER_FROM)).toBe(true);

    const both = await fetchFor("ITAU", "2026-09-01", OCTOBER_TO);
    const labels = (both.tables.asset_complaints ?? []).map((row) => `${String(row.reference_time_start)} ${String(row.trade_name)}`);
    expect(labels).toStrictEqual([
      `2026-09-01 ${ITAU_SEGUROS}`,
      `${OCTOBER_FROM} ${BANCO_ITAU}`,
      `${OCTOBER_FROM} ${ITAU_SEGUROS}`,
    ]);
  });

  it("returns no row for a term with no match (AC13)", async () => {
    const result = await fetchFor("NINGUEM", OCTOBER_FROM, OCTOBER_TO);
    expect(result.tables.asset_complaints).toStrictEqual([]);
  });

  it("fails before any request for a period that starts before 2021-08 (AC15)", async () => {
    const pending = fetchFor("ITAU", "2021-07-01", "2021-08-31");
    await expect(pending).rejects.toThrow("from 2021-08");
  });

  it("names a month after the latest published file as not published yet, and stores nothing for it", async () => {
    const result = await fetchFor("ITAU", OCTOBER_FROM, "2026-12-31");
    expect(result.itemErrors).toStrictEqual([
      "2026-11 is not published yet; its complaints are not stored",
      "2026-12 is not published yet; its complaints are not stored",
    ]);
  });

  it("fails the load, names the file and writes nothing when the download is damaged (AC3)", async () => {
    const damaged = { [OCTOBER_ZIP_URL]: new Uint8Array([1, 2, 3]) };
    const pending = fetchFor("ITAU", OCTOBER_FROM, OCTOBER_TO, damaged);
    await expect(pending).rejects.toThrow("finalizadas_2026-10.zip");
  });

  it("fails when the file has no trade name column (AC4)", async () => {
    const changed = ["regiao;uf", "a;b"].join("\n");
    const bytes = { [OCTOBER_ZIP_URL]: ZipFixture.buildZipOf({ [OCTOBER_CSV_NAME]: buildUtf8Text(changed) }) };
    const pending = fetchFor("ITAU", OCTOBER_FROM, OCTOBER_TO, bytes);
    await expect(pending).rejects.toThrow("nome_fantasia");
  });

  it("fails with the vendor's name when the publication list is not JSON", async () => {
    const pending = fetchFor("ITAU", undefined, undefined, {}, "<html>gateway</html>");
    await expect(pending).rejects.toThrow("Consumidor.gov.br");
  });
});

describe("ConsumidorGovAdapter.readMonthsBetween()", () => {
  it("lists every month of a range, across a year end", () => {
    const months = ConsumidorGovAdapter.readMonthsBetween("2025-11", "2026-02");
    expect(months).toStrictEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});
