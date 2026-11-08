import { describe, expect, it } from "vitest";
import { GetOverviewOperation } from "@/Operations/GetOverviewOperation.ts";

describe("GetOverviewOperation.execute()", () => {
  it("answers with the usage notice and no error", async () => {
    const result = await new GetOverviewOperation().execute();

    expect(result).toStrictEqual({
      isError: false,
      message: "Usage notice: the output describes and locates information. It is not investment advice, a recommendation or an analysis of what to buy or sell.",
    });
  });
});
