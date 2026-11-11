import { afterEach, describe, expect, it, vi } from "vitest";
import { LogUtil } from "@/Utils/LogUtil.ts";

describe("LogUtil.logInfo()", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes one JSON line to stderr and nothing to stdout", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    LogUtil.logInfo("server_started");

    expect(stderr).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/^\{"time":"[^"]+","level":"info","event":"server_started"\}\n$/u));
    expect(stdout).not.toHaveBeenCalled();
  });
});

describe("LogUtil.logError()", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes the event and its detail to stderr", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);

    LogUtil.logError("startup_failed", { detail: "bad value" });

    expect(stderr).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/"level":"error","event":"startup_failed","detail":"bad value"\}\n$/u));
  });
});

describe("LogUtil.setLevel()", () => {
  afterEach(() => {
    LogUtil.setLevel("info");
    vi.restoreAllMocks();
  });

  it("writes debug lines with their fields only when the level is debug", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);

    LogUtil.setLevel("debug");
    LogUtil.logDebug("config_loaded", { transport: "http", httpPort: 3100 });

    expect(stderr).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/"level":"debug","event":"config_loaded","transport":"http","httpPort":3100\}\n$/u));
  });

  it("drops debug lines at the default info level", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);

    LogUtil.logDebug("config_loaded", { transport: "http" });

    expect(stderr).not.toHaveBeenCalled();
  });

  it("keeps only errors at the error level", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);

    LogUtil.setLevel("error");
    LogUtil.logInfo("server_started");
    LogUtil.logError("startup_failed", { detail: "bad value" });

    expect(stderr).toHaveBeenCalledTimes(1);
    expect(stderr.mock.calls[0]?.[0]).toMatch(/"level":"error"/u);
  });
});

describe("LogUtil.logWarn()", () => {
  afterEach(() => {
    LogUtil.setLevel("info");
    vi.restoreAllMocks();
  });

  it("writes warn lines at the default level and drops them at the error level", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);

    LogUtil.logWarn("cvm.document.retry", { attempt: 1, attempts: 4 });
    LogUtil.setLevel("error");
    LogUtil.logWarn("cvm.document.retry", { attempt: 2, attempts: 4 });

    expect(stderr).toHaveBeenCalledTimes(1);
    expect(stderr.mock.calls[0]?.[0]).toMatch(/"level":"warn","event":"cvm.document.retry","attempt":1,"attempts":4\}\n$/u);
  });
});
