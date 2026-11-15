import type { CallbackPort, LoadNotice } from "@/Protocols/CallbackProtocol.ts";
import type { LoadJob, LoadJobSubscriber, SubscribeOutcome } from "@/Protocols/LoadJobProtocol.ts";
import type { NotifyLoadFinishDependencies, NotifyLoadFinishInput } from "@/Protocols/NotifyLoadFinishProtocol.ts";
import type { OperationAnnotations, OperationPort, OperationResult } from "@/Protocols/OperationProtocol.ts";
import { NotifyLoadFinishInputSchema } from "@/Schemas/NotifyLoadFinishSchema.ts";
import { LogUtil } from "@/Utils/LogUtil.ts";

export class NotifyLoadFinishOperation implements OperationPort<NotifyLoadFinishInput> {
  static readonly NAME = "notifyLoadFinish";
  readonly name = NotifyLoadFinishOperation.NAME;
  readonly description = "Sends one notice, with the final status of a background load, to the https callback_url given, when that load finishes. It is not read-only: it makes one POST to that address, with the status and the number of rows and no data. Use it with the loading id of a query that answered while the load was still running.";
  readonly annotations: OperationAnnotations = {
    readOnlyHint: false,
    idempotentHint: false,
    openWorldHint: true,
    destructiveHint: false,
  };

  readonly inputSchema = NotifyLoadFinishInputSchema;

  static readonly OUTCOME_TO_RESULT: Record<SubscribeOutcome, (loadingId: string, host: string) => OperationResult> = {
    unknown: (loadingId) => ({ isError: true, message: `No load has the loading id ${loadingId}; check the id of the query answer.` }),
    full: () => ({ isError: true, message: "This load already has the most notices it takes; no notice was added." }),
    done: (_loadingId, host) => ({ isError: false, message: `The load had already finished; its notice is sent now to ${host}.` }),
    registered: (loadingId, host) => ({ isError: false, message: `A notice is set: when the load ${loadingId} finishes, one POST with its final status is sent to ${host}.` }),
  };

  private readonly jobs: LoadJobSubscriber;
  private readonly callback: CallbackPort;

  constructor(dependencies: NotifyLoadFinishDependencies) {
    this.jobs = dependencies.jobs;
    this.callback = dependencies.callback;
  }

  execute(input: NotifyLoadFinishInput): Promise<OperationResult> {
    const parsed = URL.parse(input.callback_url);
    if (parsed?.protocol !== "https:") {
      return Promise.resolve({ isError: true, message: "callback_url must be an https address; no notice is set." });
    }
    const host = parsed.host;
    const outcome = this.jobs.subscribe(input.loading_id, (job) => this.send(input.callback_url, host, job));
    return Promise.resolve(NotifyLoadFinishOperation.OUTCOME_TO_RESULT[outcome](input.loading_id, host));
  }

  private async send(url: string, host: string, job: LoadJob): Promise<void> {
    const notice = NotifyLoadFinishOperation.buildNotice(job);
    try {
      await this.callback.post(url, notice);
      LogUtil.logInfo("load.notice.sent", { host, loadingId: job.id, status: notice.status });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown error";
      LogUtil.logError("load.notice.failed", { loadingId: job.id, host, reason });
    }
  }

  static buildNotice(job: LoadJob): LoadNotice {
    const entries = job.entries ?? [];
    const hasFailure = job.state === "failed" || entries.some((entry) => entry.status === "failed");
    return {
      loadingId: job.id,
      status: hasFailure ? "failed" : "loaded",
      finishedAt: job.finishedAt ?? new Date().toISOString(),
      ...(job.error === undefined ? {} : { error: job.error }),
      loads: entries.map((entry) => ({
        category: entry.category,
        market: entry.market,
        ticker: entry.ticker,
        status: entry.status,
        rowsWritten: entry.rowsWritten,
        ...(entry.error === undefined ? {} : { error: entry.error }),
      })),
    };
  }
}
