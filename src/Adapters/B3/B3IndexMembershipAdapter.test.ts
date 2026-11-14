import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { B3IndexMembershipAdapter } from "@/Adapters/B3/B3IndexMembershipAdapter.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";
import type { B3Index } from "@/Protocols/IndexMembershipProviderProtocol.ts";

const FIXTURES = join(import.meta.dirname, "..", "..", "Testing", "fixtures", "b3");
const INDEX_TO_PORTFOLIO: Readonly<Record<B3Index, string>> = {
  ISEE: readFileSync(join(FIXTURES, "index-isee-sample.json"), "utf8"),
  ICO2: readFileSync(join(FIXTURES, "index-ico2-sample.json"), "utf8"),
  IDVR: readFileSync(join(FIXTURES, "index-idvr-sample.json"), "utf8"),
  GPTW: readFileSync(join(FIXTURES, "index-gptw-empty-sample.json"), "utf8"),
};
const NOT_USED = "not used";

const PORTFOLIO_DATE = "2026-11-16";

const indexOf = (url: string): B3Index => {
  const parameter = url.split("/").pop() ?? "";
  // Why: the index is the last segment of the route, a base64 JSON; the fake answers each index with its own portfolio.
  const { index } = JSON.parse(Buffer.from(parameter, "base64").toString("utf8")) as { index: B3Index };
  return index;
};

const buildHttp = (blocked: readonly string[] = []): HttpPort => ({
  getText: (url: string) => {
    const index = indexOf(url);
    if (blocked.includes(index)) {
      return Promise.reject(new Error("the vendor answered with status 403"));
    }
    return Promise.resolve(INDEX_TO_PORTFOLIO[index]);
  },
  getBytes: () => Promise.reject(new Error(NOT_USED)),
  postForm: () => Promise.reject(new Error(NOT_USED)),
  getCookies: () => Promise.reject(new Error(NOT_USED)),
  downloadToFile: () => Promise.reject(new Error(NOT_USED)),
});

describe("B3IndexMembershipAdapter.fetchTables()", () => {
  it("writes the weight of a stock in each index it belongs to, dated with the portfolio date (AC9)", async () => {
    const result = await new B3IndexMembershipAdapter(buildHttp()).fetchTables({ market: "BR", ticker: "ITUB4", assetType: "stock" });

    expect(result.tables.asset_metrics).toStrictEqual([{
      asset_id: "BR:stock:ITUB4",
      metric: "index.isee",
      reference_time_start: PORTFOLIO_DATE,
      reference_time_end: PORTFOLIO_DATE,
      value: 3.218,
      unit: "percent",
    }]);
  });

  it("writes one row for each index a stock is in", async () => {
    const result = await new B3IndexMembershipAdapter(buildHttp()).fetchTables({ market: "BR", ticker: "TTEN3", assetType: "stock" });

    expect(result.tables.asset_metrics?.map((row) => [row.metric, row.value])).toStrictEqual([
      ["index.isee", 0.273],
      ["index.ico2", 0.255],
    ]);
  });

  it("writes no row for a stock in none of the indexes (AC10)", async () => {
    const result = await new B3IndexMembershipAdapter(buildHttp()).fetchTables({ market: "BR", ticker: "XPTO3", assetType: "stock" });

    expect(result.tables.asset_metrics).toStrictEqual([]);
  });

  it("fails the load and names the index when one index is blocked, and writes nothing (AC11, P4)", async () => {
    await expect(new B3IndexMembershipAdapter(buildHttp(["GPTW"])).fetchTables({ market: "BR", ticker: "ITUB4", assetType: "stock" }))
      .rejects.toThrow("B3's index GPTW could not be read (the vendor answered with status 403); no row was written");
  });

  it("reads a weight with a decimal comma and stores a weight that is not a number as null", () => {
    expect(B3IndexMembershipAdapter.readPercent("0,273")).toBe(0.273);
    expect(B3IndexMembershipAdapter.readPercent("-%")).toBeNull();
    expect(B3IndexMembershipAdapter.readDate("16/11/26")).toBe("2026-11-16");
  });
});
