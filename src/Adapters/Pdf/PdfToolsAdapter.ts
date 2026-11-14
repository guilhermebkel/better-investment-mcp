import { spawn } from "node:child_process";
import type { PdfTable, PdfToolsOptions, PdfToolsPort, RunResult } from "@/Protocols/PdfToolsProtocol.ts";
import { PdfTablesSchema } from "@/Schemas/PdfToolsSchema.ts";
import { EnvUtil } from "@/Utils/EnvUtil.ts";

const DEFAULT_PYTHON = "python3";
const DEFAULT_OCRMYPDF = "ocrmypdf";
// Why: the language packs of Tesseract are named here, so a scanned Portuguese page is read with Portuguese words; English is kept for the terms of the filings.
const OCR_LANGUAGES = "por+eng";
const MS_PER_MINUTE = 60_000;
const OCR_TIMEOUT_MINUTES = 15;
const TABLE_TIMEOUT_MINUTES = 2;
const OCR_TIMEOUT_MS = OCR_TIMEOUT_MINUTES * MS_PER_MINUTE;
const TABLE_TIMEOUT_MS = TABLE_TIMEOUT_MINUTES * MS_PER_MINUTE;
const BYTES_PER_MIB = 1_048_576;
const MAX_OUTPUT_MIB = 256;
const MAX_OUTPUT_BYTES = MAX_OUTPUT_MIB * BYTES_PER_MIB;
const MAX_ERROR_CHARS = 300;
const MISSING_PYMUPDF = "No module named 'pymupdf'";
const MISSING_COMMAND = "ENOENT";

// Why: the table reader is a script run with -I, as the yfinance adapter does; PyMuPDF reads the bytes from stdin and prints the tables of each page as JSON.
// Why: PyMuPDF prints its tips to stdout (for example, the pymupdf_layout hint), which would break the JSON, so stdout is sent to stderr while it works and the JSON goes to the real stdout.
const TABLE_SCRIPT = `
import json, sys
json_stream = sys.stdout
sys.stdout = sys.stderr
import pymupdf
data = sys.stdin.buffer.read()
doc = pymupdf.open(stream=data, filetype="pdf")
out = []
for index, page in enumerate(doc, start=1):
    try:
        tables = page.find_tables()
    except Exception:
        continue
    for table in tables.tables:
        rows = [["" if cell is None else str(cell).replace("\\n", " ") for cell in row] for row in table.extract()]
        if rows:
            out.append({"page": index, "rows": rows})
json.dump(out, json_stream)
`;

export class PdfToolsAdapter implements PdfToolsPort {
  private readonly python: string;
  private readonly ocrmypdf: string;

  constructor(options: PdfToolsOptions = {}) {
    this.python = options.python ?? DEFAULT_PYTHON;
    this.ocrmypdf = options.ocrmypdf ?? DEFAULT_OCRMYPDF;
  }

  static readFromEnvironment(): PdfToolsAdapter {
    const env = EnvUtil.read();
    return new PdfToolsAdapter({
      python: env.INVESTMENT_MCP_PYTHON ?? DEFAULT_PYTHON,
      ocrmypdf: env.INVESTMENT_MCP_OCRMYPDF ?? DEFAULT_OCRMYPDF,
    });
  }

  async runOcr(bytes: Uint8Array): Promise<Uint8Array> {
    // Why: pages that already have text are left as they are (--skip-text); only the scanned pages get an OCR layer.
    const args = ["--skip-text", "--language", OCR_LANGUAGES, "--output-type", "pdf", "-", "-"];
    const result = await PdfToolsAdapter.run(this.ocrmypdf, args, bytes, OCR_TIMEOUT_MS, (error) => {
      return error.includes(MISSING_COMMAND)
        ? `ocrmypdf is not installed; install it with pip install ocrmypdf and tesseract with the ${OCR_LANGUAGES} languages`
        : `ocrmypdf failed: ${error.slice(-MAX_ERROR_CHARS)}`;
    });
    return new Uint8Array(result.stdout);
  }

  async findTables(bytes: Uint8Array): Promise<PdfTable[]> {
    const result = await PdfToolsAdapter.run(this.python, ["-I", "-c", TABLE_SCRIPT], bytes, TABLE_TIMEOUT_MS, (error) => {
      if (error.includes(MISSING_PYMUPDF)) {
        return "PyMuPDF is not installed for python3; run: pip install pymupdf";
      }
      return error.includes(MISSING_COMMAND)
        ? `${this.python} is not installed`
        : `table reading failed: ${error.slice(-MAX_ERROR_CHARS)}`;
    });
    const printed: unknown = JSON.parse(result.stdout.toString("utf8"));
    return PdfTablesSchema.parse(printed);
  }

  private static run(
    command: string,
    args: readonly string[],
    input: Uint8Array,
    timeoutMs: number,
    describeError: (stderr: string) => string,
  ): Promise<RunResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
      const out: Buffer[] = [];
      const err: Buffer[] = [];
      let size = 0;
      const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
      child.stdout.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_OUTPUT_BYTES) {
          child.kill("SIGKILL");
          return;
        }
        out.push(chunk);
      });
      child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
      child.on("error", (error: Error) => {
        clearTimeout(timer);
        reject(new Error(describeError(`${error.message} ${error.name}`)));
      });
      child.on("close", (code: number | null) => {
        clearTimeout(timer);
        const stderr = Buffer.concat(err).toString("utf8");
        if (code === 0) {
          resolve({ stdout: Buffer.concat(out), stderr });
          return;
        }
        reject(new Error(describeError(stderr)));
      });
      child.stdin.on("error", () => undefined);
      child.stdin.end(Buffer.from(input));
    });
  }
}
