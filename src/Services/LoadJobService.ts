import { randomUUID } from "node:crypto";
import type { LoadedEntry, LoaderPort } from "@/Protocols/LoaderProtocol.ts";
import type { LoadJob, LoadNoticeListener, SubscribeOutcome } from "@/Protocols/LoadJobProtocol.ts";
import type { Requirement } from "@/Protocols/SqlGuardProtocol.ts";
import { DEFAULT_BACKGROUND_AFTER_SECONDS } from "@/Schemas/EnvSchema.ts";

const MS_PER_SECOND = 1000;

export class LoadJobService {
  static readonly DEFAULT_BACKGROUND_AFTER_MS = DEFAULT_BACKGROUND_AFTER_SECONDS * MS_PER_SECOND;
  // Why: a notice is sent once per callback address, and a load takes at most this many of them, so one query cannot make the server post to many addresses.
  static readonly MAX_LISTENERS_PER_JOB = 5;

  private readonly loader: LoaderPort;
  private readonly clock: () => Date;
  private readonly idToJob = new Map<string, LoadJob>();
  private readonly idToListeners = new Map<string, LoadNoticeListener[]>();

  constructor(loader: LoaderPort, clock: () => Date = () => new Date()) {
    this.loader = loader;
    this.clock = clock;
  }

  start(requirements: readonly Requirement[]): LoadJob {
    // Why: two queries that need the same loads share one load and one id, so a second query does not start the same download again.
    const key = LoadJobService.buildKey(requirements);
    const running = [...this.idToJob.values()].find((job) => job.key === key && job.state === "running");
    if (running !== undefined) {
      return running;
    }
    const job: LoadJob = {
      id: randomUUID(),
      state: "running",
      startedAt: this.clock().toISOString(),
      done: Promise.resolve(),
      key,
      requirements,
    };
    job.done = this.loader.ensure(requirements).then(
      (entries: LoadedEntry[]) => {
        job.state = "finished";
        job.entries = entries;
        job.finishedAt = this.clock().toISOString();
        this.notifyListeners(job);
      },
      (error: unknown) => {
        job.state = "failed";
        job.error = error instanceof Error ? error.message : "unknown error";
        job.finishedAt = this.clock().toISOString();
        this.notifyListeners(job);
      },
    );
    this.idToJob.set(job.id, job);
    return job;
  }

  subscribe(id: string, listener: LoadNoticeListener): SubscribeOutcome {
    const job = this.idToJob.get(id);
    if (job === undefined) {
      return "unknown";
    }
    if (job.state !== "running") {
      // Why: a load that finished before the notice was asked for still gets its notice, once, now.
      void listener(job);
      return "done";
    }
    const listeners = this.idToListeners.get(id) ?? [];
    if (listeners.length >= LoadJobService.MAX_LISTENERS_PER_JOB) {
      return "full";
    }
    this.idToListeners.set(id, [...listeners, listener]);
    return "registered";
  }

  private notifyListeners(job: LoadJob): void {
    const listeners = this.idToListeners.get(job.id) ?? [];
    this.idToListeners.delete(job.id);
    for (const listener of listeners) {
      void listener(job);
    }
  }

  get(id: string): LoadJob | undefined {
    return this.idToJob.get(id);
  }

  static waitUpTo(job: LoadJob, milliseconds: number): Promise<boolean> {
    // Why: the query waits for the load only up to the threshold; a load that finishes first is returned as it is, and one that does not is left to run.
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve(false);
      }, milliseconds);
      void job.done.then(() => {
        clearTimeout(timer);
        resolve(true);
      });
    });
  }

  static describe(job: LoadJob): string {
    return job.requirements
      .map((requirement) => `${requirement.market}:${requirement.ticker} ${requirement.category}`)
      .join(", ");
  }

  private static buildKey(requirements: readonly Requirement[]): string {
    const parts = requirements.map((requirement) => JSON.stringify([
      requirement.category, requirement.table, requirement.market, requirement.ticker,
      requirement.assetType ?? null, requirement.period ?? null,
      requirement.filingId ?? null, requirement.filingType ?? null,
    ]));
    return parts.sort().join("|");
  }
}
