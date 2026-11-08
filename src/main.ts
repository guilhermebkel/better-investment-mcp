import { StartupRunner } from "@/Setup/StartupRunner.ts";
import { LogUtil } from "@/Utils/LogUtil.ts";

try {
  StartupRunner.run();
} catch (error) {
  LogUtil.logError("startup_failed", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
}
