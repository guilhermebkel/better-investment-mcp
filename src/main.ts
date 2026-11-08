import { StartupRunner } from "@/Setup/StartupRunner.ts";
import { LogUtil } from "@/Utils/LogUtil.ts";

const FIRST_USER_ARG = 2;

try {
  await StartupRunner.run(process.argv.slice(FIRST_USER_ARG));
} catch (error) {
  LogUtil.logError("startup_failed", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
}
