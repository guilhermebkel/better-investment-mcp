import { EnvUtil } from "@/Utils/EnvUtil.ts";
import { LogUtil } from "@/Utils/LogUtil.ts";

export class StartupRunner {
  static run(): void {
    // Why: nothing else runs yet; reading the environment first makes a wrong value fail at start with a clear message.
    const env = EnvUtil.read();
    LogUtil.setLevel(env.INVESTMENT_MCP_LOG_LEVEL);
    LogUtil.logInfo("environment_valid");
  }
}
