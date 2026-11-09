import { describe, expect, it, vi } from "vitest";
import {
  checkSystemTools,
  detectPackageManager,
  ensureTools,
  isPythonToolsUpToDate,
  SYSTEM_INSTALL_COMMANDS,
} from "./ensure-tools.mjs";

const LANGUAGES_OK = { status: 0, stdout: "List of available languages (3):\neng\nosd\npor\n", stderr: "" };
const GHOSTSCRIPT_OK = { status: 0, stdout: "10.0\n", stderr: "" };
const FAILED = { status: 127, stdout: "", stderr: "" };

describe("isPythonToolsUpToDate()", () => {
  it("is up to date when the install marker is newer than the requirements", () => {
    const mtimes = { "requirements-tools.txt": 100, ".venv/.requirements-installed": 200 };
    const upToDate = isPythonToolsUpToDate({
      exists: (path) => path in mtimes,
      stat: (path) => ({ mtimeMs: mtimes[path] }),
    });
    expect(upToDate).toBe(true);
  });

  it("is not up to date when there is no marker", () => {
    expect(isPythonToolsUpToDate({ exists: () => false, stat: vi.fn() })).toBe(false);
  });

  it("is not up to date when the requirements changed after the install", () => {
    const mtimes = { "requirements-tools.txt": 300, ".venv/.requirements-installed": 200 };
    const upToDate = isPythonToolsUpToDate({
      exists: (path) => path in mtimes,
      stat: (path) => ({ mtimeMs: mtimes[path] }),
    });
    expect(upToDate).toBe(false);
  });
});

describe("checkSystemTools()", () => {
  it("reports nothing when tesseract reads Portuguese and English and ghostscript runs", () => {
    const run = (command) => ({ tesseract: LANGUAGES_OK, gs: GHOSTSCRIPT_OK })[command];
    expect(checkSystemTools({ run })).toStrictEqual([]);
  });

  it("reports tesseract when it is not installed, and ghostscript when it is not", () => {
    expect(checkSystemTools({ run: () => FAILED })).toStrictEqual(["tesseract", "ghostscript"]);
  });

  it("reports a missing Portuguese language even when tesseract runs", () => {
    const run = (command) => ({ tesseract: { status: 0, stdout: "eng\nosd\n", stderr: "" }, gs: GHOSTSCRIPT_OK })[command];
    expect(checkSystemTools({ run })).toStrictEqual(["tesseract language por"]);
  });
});

describe("detectPackageManager()", () => {
  it("prefers apk on Alpine, then apt, then brew", () => {
    expect(detectPackageManager({ exists: (path) => path === "/etc/alpine-release", has: () => true }))
      .toBe("apk");
    expect(detectPackageManager({ exists: () => false, has: (command) => command === "apt-get" })).toBe("apt");
    expect(detectPackageManager({ exists: () => false, has: (command) => command === "brew" })).toBe("brew");
    expect(detectPackageManager({ exists: () => false, has: () => false })).toBeNull();
  });
});

describe("ensureTools()", () => {
  it("returns 0 and installs nothing when the Python tools are current and the system tools are present", () => {
    const setupPython = vi.fn();
    const status = ensureTools({
      isPythonUpToDate: () => true,
      findMissingSystemTools: () => [],
      log: vi.fn(),
      setupPython,
    });
    expect(status).toBe(0);
    expect(setupPython).not.toHaveBeenCalled();
  });

  it("sets up the Python tools when they are not current", () => {
    const setupPython = vi.fn(() => true);
    const status = ensureTools({
      isPythonUpToDate: () => false,
      findMissingSystemTools: () => [],
      log: vi.fn(),
      setupPython,
    });
    expect(status).toBe(0);
    expect(setupPython).toHaveBeenCalledOnce();
  });

  it("fails and names the one command for the detected package manager when a system tool is missing", () => {
    const log = vi.fn();
    const status = ensureTools({
      isPythonUpToDate: () => true,
      findMissingSystemTools: () => ["tesseract", "ghostscript"],
      detectManager: () => "apk",
      log,
    });

    expect(status).toBe(1);
    const message = `missing system tools: tesseract, ghostscript. Run once: ${SYSTEM_INSTALL_COMMANDS.apk}`;
    expect(log).toHaveBeenCalledWith(message);
  });

  it("fails when the Python tools cannot be installed", () => {
    const status = ensureTools({
      isPythonUpToDate: () => false,
      setupPython: () => false,
      findMissingSystemTools: () => [],
      log: vi.fn(),
    });
    expect(status).toBe(1);
  });
});
