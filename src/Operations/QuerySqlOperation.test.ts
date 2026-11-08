import { describe, expect, it } from "vitest";
import { QuerySqlOperation } from "@/Operations/QuerySqlOperation.ts";

describe("QuerySqlOperation.execute()", () => {
  it("refuses with an error that says the store is not connected and that nothing ran", () => {
    const result = new QuerySqlOperation().execute();

    expect(result).toStrictEqual({
      isError: true,
      message: "The data store is not connected yet, so no query runs. Nothing was run. Read get_overview for what the server does.",
    });
  });
});
