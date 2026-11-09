import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIRECTORY_PREFIX = "investment-mcp-";

export class TempFileUtil {
  static async runInTempDir<Result>(work: (directory: string) => Promise<Result>): Promise<Result> {
    // Why: a download is written to a directory of this process's own, removed when the work ends, pass or fail.
    const prefix = join(tmpdir(), DIRECTORY_PREFIX);
    const directory = await mkdtemp(prefix);
    try {
      return await work(directory);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
