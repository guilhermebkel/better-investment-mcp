import { describe, expect, it } from "vitest";
import { OperationManifestSurface } from "@/Surfaces/OperationManifestSurface.ts";

describe("OperationManifestSurface.listOperations()", () => {
  it("lists exactly the three read-only tools of the architecture", () => {
    const toolNames = OperationManifestSurface.listOperations().map((operation) => {
      return OperationManifestSurface.formatToolName(operation.name);
    });

    expect(toolNames).toStrictEqual(["get_overview", "get_guide", "query_sql"]);
  });

  it("starts every description with Read-only.", () => {
    const descriptions = OperationManifestSurface.listOperations().map((operation) => operation.description);

    expect(descriptions.map((description) => description.startsWith("Read-only."))).toStrictEqual([true, true, true]);
  });
});

describe("OperationManifestSurface.formatToolName()", () => {
  it("turns a camelCase operation name into the snake_case tool name", () => {
    expect(OperationManifestSurface.formatToolName("querySql")).toBe("query_sql");
  });
});
