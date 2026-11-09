import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const REQUIREMENTS_PATH = "requirements-tools.txt";
export const VENV_DIR = ".venv";
export const VENV_PYTHON = ".venv/bin/python";
export const INSTALL_MARKER_PATH = ".venv/.requirements-installed";
const REQUIRED_LANGUAGES = ["por", "eng"];

export const SYSTEM_INSTALL_COMMANDS = {
  apk: "apk add tesseract-ocr tesseract-ocr-data-por tesseract-ocr-data-eng ghostscript",
  apt: "sudo apt-get install -y tesseract-ocr tesseract-ocr-por tesseract-ocr-eng ghostscript",
  brew: "brew install tesseract tesseract-lang ghostscript",
};

export const isPythonToolsUpToDate = ({ exists = existsSync, stat = statSync } = {}) => {
  if (!exists(INSTALL_MARKER_PATH) || !exists(REQUIREMENTS_PATH)) {
    return false;
  }
  return stat(REQUIREMENTS_PATH).mtimeMs <= stat(INSTALL_MARKER_PATH).mtimeMs;
};

export const detectPackageManager = ({ exists = existsSync, has = (command) => spawnSync("which", [command]).status === 0 } = {}) => {
  if (exists("/etc/alpine-release")) {
    return "apk";
  }
  if (has("apt-get")) {
    return "apt";
  }
  if (has("brew")) {
    return "brew";
  }
  return null;
};

export const checkSystemTools = ({ run = (command, args) => spawnSync(command, args, { encoding: "utf8" }) } = {}) => {
  // Why: the check runs the tools the code calls, so a tool that is on the path but cannot read Portuguese is reported as missing.
  const missing = [];
  const tesseract = run("tesseract", ["--list-langs"]);
  if (tesseract.error !== undefined || tesseract.status !== 0) {
    missing.push("tesseract");
  } else {
    const languages = `${tesseract.stdout ?? ""}${tesseract.stderr ?? ""}`.split(/\s+/u);
    for (const language of REQUIRED_LANGUAGES.filter((language) => !languages.includes(language))) {
      missing.push(`tesseract language ${language}`);
    }
  }
  const ghostscript = run("gs", ["--version"]);
  if (ghostscript.error !== undefined || ghostscript.status !== 0) {
    missing.push("ghostscript");
  }
  return missing;
};

const runSetup = ({ run = (command, args) => spawnSync(command, args, { stdio: "inherit" }) } = {}) => {
  if (!existsSync(VENV_PYTHON)) {
    mkdirSync(VENV_DIR, { recursive: true });
    const created = run("python3", ["-m", "venv", VENV_DIR]);
    if (created.status !== 0) {
      return false;
    }
  }
  const installed = run(VENV_PYTHON, ["-m", "pip", "install", "--quiet", "-r", REQUIREMENTS_PATH]);
  if (installed.status !== 0) {
    return false;
  }
  writeFileSync(INSTALL_MARKER_PATH, new Date().toISOString());
  return true;
};

export const ensureTools = ({
  isPythonUpToDate = isPythonToolsUpToDate,
  setupPython = runSetup,
  findMissingSystemTools = checkSystemTools,
  detectManager = detectPackageManager,
  log = (message) => process.stdout.write(`${message}\n`),
} = {}) => {
  // Why: the system tools cannot be installed without root, so the script names the one command to run and fails, rather than guessing a package manager's sudo.
  let status = 0;
  if (!isPythonUpToDate() && !setupPython()) {
    log("the Python tools could not be installed into .venv; see the output above");
    status = 1;
  }
  const missing = findMissingSystemTools();
  if (missing.length > 0) {
    const manager = detectManager();
    const command = manager === null ? "install tesseract (with the por and eng languages) and ghostscript" : SYSTEM_INSTALL_COMMANDS[manager];
    log(`missing system tools: ${missing.join(", ")}. Run once: ${command}`);
    status = 1;
  }
  return status;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(ensureTools());
}
