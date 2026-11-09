import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import { HttpAuthService } from "@/Services/HttpAuthService.ts";

const TOKEN = "expected-token-123";
const OTHER_TOKEN = "other-token-456";

const buildRequest = (authorization: string | undefined): IncomingMessage => ({
  headers: authorization === undefined ? {} : { authorization },
}) as unknown as IncomingMessage;

describe("HttpAuthService.verifyRequest()", () => {
  const auth = new HttpAuthService(TOKEN);

  it("accepts the bearer token", () => {
    const isAccepted = auth.verifyRequest(buildRequest(`Bearer ${TOKEN}`));

    expect(isAccepted).toBe(true);
  });

  it("accepts the scheme in any letter case", () => {
    const isAccepted = auth.verifyRequest(buildRequest(`bearer ${TOKEN}`));

    expect(isAccepted).toBe(true);
  });

  it.each([
    ["no header", undefined],
    ["another scheme", `Basic ${TOKEN}`],
    ["an empty bearer value", "Bearer "],
    ["a different token", `Bearer ${OTHER_TOKEN}`],
    ["the token without the scheme", TOKEN],
  ])("refuses %s", (_label, authorization) => {
    const isAccepted = auth.verifyRequest(buildRequest(authorization));

    expect(isAccepted).toBe(false);
  });

  it("refuses every request when no token is configured", () => {
    const unconfigured = new HttpAuthService(undefined);

    const isAccepted = unconfigured.verifyRequest(buildRequest(`Bearer ${TOKEN}`));

    expect(isAccepted).toBe(false);
  });
});
