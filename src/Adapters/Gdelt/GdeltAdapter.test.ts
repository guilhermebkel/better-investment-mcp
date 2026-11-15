import { describe, expect, it } from "vitest";
import { GdeltAdapter } from "@/Adapters/Gdelt/GdeltAdapter.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import type { ProviderRequest, ProviderResult } from "@/Protocols/ProviderProtocol.ts";

const NOT_USED = "not used";
const NOW = new Date("2026-11-15T12:00:00Z");
const TICKER = "PETROBRAS";
const ASSET_ID = "BR:news:PETROBRAS";
const WINDOW_FROM = "2026-11-01";
const WINDOW_TO = "2026-11-14";
const OLD_FROM = "2025-01-01";
const OLD_TO = "2025-06-30";
const WIDE_FROM = "2026-01-01";
const WIDE_TO = "2026-12-31";
const LIMIT_ANSWER = "the vendor answered with status 429";
const ARTICLES = JSON.stringify({
  articles: [
    { url: "https://example.com/a", title: "Petrobras anuncia", seendate: "20261110T093000Z", domain: "example.com", language: "Portuguese", sourcecountry: "Brazil" },
    { url: "https://example.org/b", title: null, seendate: "20261111T100000Z", domain: "example.org", language: "English", sourcecountry: "United States" },
  ],
});
const FIRST_ARTICLE = {
  asset_id: ASSET_ID,
  url: "https://example.com/a",
  title: "Petrobras anuncia",
  domain: "example.com",
  language: "Portuguese",
  source_country: "Brazil",
  published_time: "2026-11-10T09:30:00Z",
};
const SECOND_ARTICLE = {
  asset_id: ASSET_ID,
  url: "https://example.org/b",
  title: null,
  domain: "example.org",
  language: "English",
  source_country: "United States",
  published_time: "2026-11-11T10:00:00Z",
};

type Answer = () => Promise<string>;

const buildHttp = (answer: Answer, requested: string[] = []): HttpPort => ({
  getText: (url: string) => {
    requested.push(url);
    return answer();
  },
  getBytes: () => Promise.reject(new Error(NOT_USED)),
  postForm: () => Promise.reject(new Error(NOT_USED)),
  getCookies: () => Promise.reject(new Error(NOT_USED)),
  downloadToFile: () => Promise.reject(new Error(NOT_USED)),
});

const buildRequest = (ticker: string, from: string, to: string): ProviderRequest => {
  const period = { from, to };
  return { market: "BR", assetType: "news", period, ticker };
};

const fetchFor = (
  ticker: string,
  from: string,
  to: string,
  answer: Answer,
  requested: string[] = [],
): Promise<ProviderResult> => {
  const http = buildHttp(answer, requested);
  const adapter = new GdeltAdapter(http, GdeltAdapter.BASE_URL, () => NOW);
  const request = buildRequest(ticker, from, to);
  return adapter.fetchTables(request);
};

const answerWith = (text: string): Answer => () => Promise.resolve(text);

describe("GdeltAdapter.fetchTables()", () => {
  it("sends the term, the window and the limit, and stores each article (AC23)", async () => {
    const requested: string[] = [];
    const result = await fetchFor(TICKER, WINDOW_FROM, WINDOW_TO, answerWith(ARTICLES), requested);

    expect(requested).toHaveLength(1);
    const url = new URL(requested[0] ?? "");
    expect(url.searchParams.get("query")).toBe(TICKER);
    expect(url.searchParams.get("startdatetime")).toBe("20261101000000");
    expect(url.searchParams.get("enddatetime")).toBe("20261114235959");
    expect(url.searchParams.get("maxrecords")).toBe("250");
    expect(result.tables.asset_news).toStrictEqual([FIRST_ARTICLE, SECOND_ARTICLE]);
  });

  it("quotes a term with a space as a phrase, and reads an empty answer as zero articles (AC26)", async () => {
    const requested: string[] = [];
    const result = await fetchFor("BANCO_DO_BRASIL", WINDOW_FROM, WINDOW_TO, answerWith(""), requested);

    const url = new URL(requested[0] ?? "");
    expect(url.searchParams.get("query")).toBe("\"BANCO DO BRASIL\"");
    expect(result.tables.asset_news).toStrictEqual([]);
  });

  it("names the window and writes nothing for a period that ends before it (AC25)", async () => {
    const pending = fetchFor(TICKER, OLD_FROM, OLD_TO, answerWith(ARTICLES));
    await expect(pending).rejects.toThrow("last 3 months");
  });

  it("answers the part of a period inside the window and names the part it cannot answer", async () => {
    const result = await fetchFor(TICKER, WIDE_FROM, WIDE_TO, answerWith(ARTICLES));
    expect(result.itemErrors).toStrictEqual(["GDELT searches the last 3 months only; the rows before 2026-08-15 are not available"]);
  });

  it("fails with the reason when GDELT rate-limits the server (issue #59, S25)", async () => {
    const rejectLimit: Answer = () => Promise.reject(new Error(LIMIT_ANSWER));
    const pending = fetchFor(TICKER, WINDOW_FROM, WINDOW_TO, rejectLimit);
    await expect(pending).rejects.toThrow("rate-limiting");
  });
});

describe("GdeltAdapter.buildIsoTime()", () => {
  it("turns a GDELT time into an ISO time in UTC, and refuses another shape", () => {
    expect(GdeltAdapter.buildIsoTime("20261110T093000Z")).toBe("2026-11-10T09:30:00Z");
    expect(() => GdeltAdapter.buildIsoTime("2026-11-10")).toThrow("not a GDELT time");
  });
});
