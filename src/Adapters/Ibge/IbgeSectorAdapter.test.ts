import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { IbgeSectorAdapter } from "@/Adapters/Ibge/IbgeSectorAdapter.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";

const FIXTURE_PATH = join(import.meta.dirname, "..", "..", "Testing", "fixtures", "ibge", "sidra-6449-companies-sample.json");
const SAMPLE = readFileSync(FIXTURE_PATH, "utf8");
const NOT_USED = "not used";

const buildHttp = (): HttpPort => ({
  getText: () => Promise.resolve(SAMPLE),
  getBytes: () => Promise.reject(new Error(NOT_USED)),
  postForm: () => Promise.reject(new Error(NOT_USED)),
  getCookies: () => Promise.reject(new Error(NOT_USED)),
  downloadToFile: () => Promise.reject(new Error(NOT_USED)),
});

describe("IbgeSectorAdapter.fetchTables()", () => {
  it("writes the number of companies of a CNAE class, by year, as sector.companies (AC5)", async () => {
    const result = await new IbgeSectorAdapter(buildHttp()).fetchTables({ market: "BR", ticker: "29.10-7", assetType: "sector" });

    expect(result.tables.asset_metrics).toStrictEqual([{
      asset_id: "BR:sector:29.10-7",
      metric: "sector.companies",
      reference_time_start: "2021-01-01",
      reference_time_end: "2021-12-31",
      value: 57,
      unit: "count",
    }]);
  });

  it("stores a missing value as null, not as zero (AC6)", async () => {
    const result = await new IbgeSectorAdapter(buildHttp()).fetchTables({ market: "BR", ticker: "10", assetType: "sector" });

    expect(result.tables.asset_metrics?.map((row) => row.value)).toStrictEqual([58077, null]);
  });

  it("names the code and the table when the code is not a category of the table, and writes nothing (AC7)", async () => {
    await expect(new IbgeSectorAdapter(buildHttp()).fetchTables({ market: "BR", ticker: "99.99-9", assetType: "sector" }))
      .rejects.toThrow("IBGE's table 6449 has no CNAE category 99.99-9; no row was written");
  });
});
