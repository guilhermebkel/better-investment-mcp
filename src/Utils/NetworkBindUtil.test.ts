import { describe, expect, it } from "vitest";
import { NetworkBindUtil } from "@/Utils/NetworkBindUtil.ts";

describe("NetworkBindUtil.buildUrlHost()", () => {
  it("wraps an IPv6 address in brackets for a URL", () => {
    expect(NetworkBindUtil.buildUrlHost("::1")).toBe("[::1]");
  });

  it("leaves an IPv4 address as it is", () => {
    expect(NetworkBindUtil.buildUrlHost("127.0.0.1")).toBe("127.0.0.1");
  });
});

describe("NetworkBindUtil.buildProbeHost()", () => {
  it("probes the loopback address when the server binds to every IPv4 address", () => {
    expect(NetworkBindUtil.buildProbeHost("0.0.0.0")).toBe("127.0.0.1");
  });

  it("probes the IPv6 loopback address when the server binds to every IPv6 address", () => {
    expect(NetworkBindUtil.buildProbeHost("::")).toBe("[::1]");
  });

  it("probes the address it is bound to otherwise", () => {
    expect(NetworkBindUtil.buildProbeHost("127.0.0.1")).toBe("127.0.0.1");
  });
});
