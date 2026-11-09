import { UnhealthyError } from "@/Errors/UnhealthyError.ts";
import type { Env } from "@/Protocols/EnvProtocol.ts";
import { DEFAULT_HTTP_HOST, DEFAULT_HTTP_PORT } from "@/Schemas/EnvSchema.ts";
import { NetworkBindUtil } from "@/Utils/NetworkBindUtil.ts";

const PROBE_TIMEOUT_MS = 2000;

export class HealthRunner {
  static async run(env: Env): Promise<void> {
    if (!(await HealthRunner.check(env))) {
      throw new UnhealthyError();
    }
  }

  static async check(env: Env): Promise<boolean> {
    // Why: over stdio there is no listener to probe, so the check passes; the Docker HEALTHCHECK runs this command in both modes.
    if (env.INVESTMENT_MCP_TRANSPORT !== "http") {
      return true;
    }
    const host = NetworkBindUtil.buildProbeHost(env.INVESTMENT_MCP_HTTP_HOST ?? DEFAULT_HTTP_HOST);
    try {
      const response = await fetch(`http://${host}:${env.INVESTMENT_MCP_HTTP_PORT ?? DEFAULT_HTTP_PORT}/health`, {
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      return response.ok && (await response.text()) === "ok";
    } catch {
      return false;
    }
  }
}
