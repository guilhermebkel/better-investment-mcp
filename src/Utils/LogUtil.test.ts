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

    expect(stderr).toHaveBeenCalledExactlyOnceWith("{\"level\":\"info\",\"event\":\"server_started\"}\n");
    expect(stdout).not.toHaveBeenCalled();
  });
});

describe("LogUtil.logError()", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes the event and its detail to stderr", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);

    LogUtil.logError("startup_failed", "bad value");

    expect(stderr).toHaveBeenCalledExactlyOnceWith("{\"level\":\"error\",\"event\":\"startup_failed\",\"detail\":\"bad value\"}\n");
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

    expect(stderr).toHaveBeenCalledExactlyOnceWith("{\"level\":\"debug\",\"event\":\"config_loaded\",\"transport\":\"http\",\"httpPort\":3100}\n");
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
    LogUtil.logError("startup_failed", "bad value");

    expect(stderr).toHaveBeenCalledTimes(1);
    expect(stderr.mock.calls[0]?.[0]).toBe("{\"level\":\"error\",\"event\":\"startup_failed\",\"detail\":\"bad value\"}\n");
  });
});
