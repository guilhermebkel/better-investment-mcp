import { describe, expect, it } from "vitest";
import { GetOverviewOperation } from "@/Operations/GetOverviewOperation.ts";

const buildOperation = (rows: Record<string, unknown>[] | Error) => new GetOverviewOperation({
  cacheTtlSeconds: 86_400,
  readLoaded: () => (rows instanceof Error ? Promise.reject(rows) : Promise.resolve(rows)),
});

describe("GetOverviewOperation.execute()", () => {
  it("lists the tables, the filter rule, the guide topics and the usage notice (AC1)", async () => {
    const result = await buildOperation([]).execute();

    expect(result.isError).toBe(false);
    expect(result.message).toContain("- asset_quotes: daily prices");
    expect(result.message).toContain("Filter rule: every asset table needs WHERE asset_id");
    expect(result.message).toContain("Guide topics for get_guide: sql, search, sources, analysis, fre, limits.");
    expect(result.message).toContain(GetOverviewOperation.USAGE_NOTICE);
  });

  it("shows what is loaded and until when after a load (AC2)", async () => {
    const result = await buildOperation([
      { asset_id: "BR:stock:PETR4", category: "quotes", first_date: "2026-11-02", last_date: "2026-11-06", expires_at: "2026-11-09T14:00:00Z" },
    ]).execute();

    expect(result.message).toContain("- BR:stock:PETR4 quotes, 2026-11-02 to 2026-11-06, valid until 2026-11-09T14:00:00Z");
  });

  it("says nothing is loaded yet when the catalog is empty", async () => {
    const result = await buildOperation([]).execute();
    expect(result.message).toContain("nothing yet");
  });

  it("does not fail when the loaded list cannot be read", async () => {
    const result = await buildOperation(new Error("store is busy")).execute();
    expect(result.isError).toBe(false);
    expect(result.message).toContain("the loaded list cannot be read now");
  });

  it("names the cache location by its variable, never its value, and the TTL", async () => {
    const result = await buildOperation([]).execute();
    expect(result.message).toContain("set by INVESTMENT_MCP_CACHE_DIR");
    expect(result.message).toContain("valid for 86400 seconds");
  });
});
