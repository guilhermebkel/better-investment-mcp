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
  notifyLoadFinish: { jobs: { subscribe: () => "unknown" }, callback: { post: () => Promise.resolve() } },
};

describe("OperationManifestSurface.listOperations()", () => {
  it("lists the four tools: three read-only ones and notify_load_finish (ADR 0028)", () => {
    const toolNames = OperationManifestSurface.listOperations(UNUSED_DEPENDENCIES).map((operation) => {
      return OperationManifestSurface.formatToolName(operation.name);
    });

    expect(toolNames).toStrictEqual(["get_overview", "get_guide", "query_sql", "notify_load_finish"]);
  });

  it("starts the description of every read-only tool with Read-only.", () => {
    const readOnly = OperationManifestSurface.listOperations(UNUSED_DEPENDENCIES)
      .filter((operation) => operation.annotations.readOnlyHint);

    expect(readOnly.map((operation) => operation.description.startsWith("Read-only."))).toStrictEqual([true, true, true]);
  });

  it("marks notify_load_finish as not read-only, and says what it sends", () => {
    const notify = OperationManifestSurface.listOperations(UNUSED_DEPENDENCIES).find((operation) => operation.name === "notifyLoadFinish");

    expect(notify?.annotations.readOnlyHint).toBe(false);
    expect(notify?.description).toContain("POST");
  });
});

describe("OperationManifestSurface.formatToolName()", () => {
  it("turns a camelCase operation name into the snake_case tool name", () => {
    expect(OperationManifestSurface.formatToolName("querySql")).toBe("query_sql");
  });

  it("declares the annotations of every tool in one place (AC5)", () => {
    const annotations = Object.fromEntries(OperationManifestSurface.listOperations(UNUSED_DEPENDENCIES)
      .map((operation) => [operation.name, operation.annotations]));

    expect(annotations).toStrictEqual({
      getGuide: { readOnlyHint: true, idempotentHint: true, openWorldHint: false, destructiveHint: false },
      getOverview: { readOnlyHint: true, idempotentHint: true, openWorldHint: false, destructiveHint: false },
      querySql: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, destructiveHint: false },
      notifyLoadFinish: { readOnlyHint: false, idempotentHint: false, openWorldHint: true, destructiveHint: false },
    });
  });
});
