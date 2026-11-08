import { UnknownCommandError } from "@/Errors/UnknownCommandError.ts";
import { InitRunner } from "@/Setup/InitRunner.ts";
import { StdioRunner } from "@/Setup/StdioRunner.ts";
import { EnvUtil } from "@/Utils/EnvUtil.ts";
import { LogUtil } from "@/Utils/LogUtil.ts";

export class StartupRunner {
  static readonly INIT_COMMAND = "init";

  static async run(args: readonly string[]): Promise<void> {
    // Why: reading the environment first makes a wrong value fail at start with a clear message, before any command runs.
    const env = EnvUtil.read();
    LogUtil.setLevel(env.INVESTMENT_MCP_LOG_LEVEL);
    LogUtil.logInfo("environment_valid");
    const [command] = args;
    if (command === undefined) {
      await StdioRunner.run();
      return;
    }
    if (command !== StartupRunner.INIT_COMMAND) {
      throw new UnknownCommandError();
    }
    InitRunner.run();
  }
}
