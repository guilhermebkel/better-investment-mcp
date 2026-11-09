import { UnknownCommandError } from "@/Errors/UnknownCommandError.ts";
import type { Env } from "@/Protocols/EnvProtocol.ts";
import { HealthRunner } from "@/Setup/HealthRunner.ts";
import { HttpRunner } from "@/Setup/HttpRunner.ts";
import { InitRunner } from "@/Setup/InitRunner.ts";
import { StdioRunner } from "@/Setup/StdioRunner.ts";
import { EnvUtil } from "@/Utils/EnvUtil.ts";
import { LogUtil } from "@/Utils/LogUtil.ts";

const TRANSPORT_TO_RUNNER: Record<NonNullable<Env["INVESTMENT_MCP_TRANSPORT"]>, (env: Env) => Promise<void>> = {
  stdio: (env) => StdioRunner.run(env),
  http: (env) => HttpRunner.run(env),
};

export class StartupRunner {
  static readonly INIT_COMMAND = "init";
  static readonly HEALTH_COMMAND = "health";

  static async run(args: readonly string[]): Promise<void> {
    // Why: reading the environment first makes a wrong value fail at start with a clear message, before any command runs.
    const env = EnvUtil.read();
    LogUtil.setLevel(env.INVESTMENT_MCP_LOG_LEVEL);
    LogUtil.logInfo("environment_valid");
    const [command] = args;
    if (command === undefined) {
      await TRANSPORT_TO_RUNNER[env.INVESTMENT_MCP_TRANSPORT ?? "stdio"](env);
      return;
    }
    if (command === StartupRunner.INIT_COMMAND) {
      InitRunner.run();
      return;
    }
    if (command === StartupRunner.HEALTH_COMMAND) {
      await HealthRunner.run(env);
      return;
    }
    throw new UnknownCommandError();
  }
}
