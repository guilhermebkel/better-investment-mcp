import { describe, expect, it } from "vitest";
import type { OperationDependencies } from "@/Protocols/OperationProtocol.ts";
import { OperationManifestSurface } from "@/Surfaces/OperationManifestSurface.ts";

const UNUSED_DEPENDENCIES: OperationDependencies = {
  querySql: {
    guard: { checkSql: () => Promise.resolve({ isAccepted: true, requirements: [] }) },
    loader: { ensure: () => Promise.resolve([]) },
    openReader: () => Promise.reject(new Error("not used by the manifest test")),
  },
  overview: { cacheTtlSeconds: 60, readLoaded: () => Promise.resolve([]) },
};

describe("OperationManifestSurface.listOperations()", () => {
  it("lists exactly the three read-only tools of the architecture", () => {
    const toolNames = OperationManifestSurface.listOperations(UNUSED_DEPENDENCIES).map((operation) => {
      return OperationManifestSurface.formatToolName(operation.name);
    });

    expect(toolNames).toStrictEqual(["get_overview", "get_guide", "query_sql"]);
  });

  it("starts every description with Read-only.", () => {
    const operations = OperationManifestSurface.listOperations(UNUSED_DEPENDENCIES);
    const descriptions = operations.map((operation) => operation.description);

    expect(descriptions.map((description) => description.startsWith("Read-only."))).toStrictEqual([true, true, true]);
  });
});

describe("OperationManifestSurface.formatToolName()", () => {
  it("turns a camelCase operation name into the snake_case tool name", () => {
    expect(OperationManifestSurface.formatToolName("querySql")).toBe("query_sql");
  });
});
