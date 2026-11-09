import { describe, expect, it } from "vitest";
import type { LoadedEntry, LoaderPort } from "@/Protocols/LoaderProtocol.ts";
import type { Requirement } from "@/Protocols/SqlGuardProtocol.ts";
import { LoadJobService } from "@/Services/LoadJobService.ts";

const PETR4: Requirement = { table: "asset_quotes", category: "quotes", market: "BR", ticker: "PETR4", assetType: "stock" };
const VALE3: Requirement = { table: "asset_quotes", category: "quotes", market: "BR", ticker: "VALE3", assetType: "stock" };
const ENTRY = {
  category: "quotes", market: "BR", ticker: "PETR4", status: "loaded", isFallback: false, rowsWritten: 1,
} as LoadedEntry;

type Deferred = {
  loader: LoaderPort;
  calls: Requirement[][];
  resolve: (entries: LoadedEntry[]) => void;
  reject: (error: Error) => void;
};

const buildDeferredLoader = (): Deferred => {
  const calls: Requirement[][] = [];
  let resolveLoad: (entries: LoadedEntry[]) => void = () => undefined;
  let rejectLoad: (error: Error) => void = () => undefined;
  const loader: LoaderPort = {
    ensure: (requirements) => {
      calls.push([...requirements]);
      return new Promise<LoadedEntry[]>((resolve, reject) => {
        resolveLoad = resolve;
        rejectLoad = reject;
      });
    },
  };
  return {
    loader,
    calls,
    resolve: (entries) => {
      resolveLoad(entries);
    },
    reject: (error) => {
      rejectLoad(error);
    },
  };
};

describe("LoadJobService.start()", () => {
  it("starts one load and gives it an id that get finds while it runs", () => {
    const deferred = buildDeferredLoader();
    const jobs = new LoadJobService(deferred.loader);

    const job = jobs.start([PETR4]);

    expect(job.state).toBe("running");
    expect(jobs.get(job.id)).toBe(job);
    expect(deferred.calls).toHaveLength(1);
  });

  it("shares the running load with a second request for the same requirements, so the same id comes back", () => {
    const deferred = buildDeferredLoader();
    const jobs = new LoadJobService(deferred.loader);

    const first = jobs.start([PETR4]);
    const second = jobs.start([PETR4]);

    expect(second.id).toBe(first.id);
    expect(deferred.calls).toHaveLength(1);
  });

  it("starts a separate load for other requirements", () => {
    const deferred = buildDeferredLoader();
    const jobs = new LoadJobService(deferred.loader);

    const first = jobs.start([PETR4]);
    const other = jobs.start([VALE3]);

    expect(other.id).not.toBe(first.id);
    expect(deferred.calls).toHaveLength(2);
  });

  it("marks the load finished with its entries when the loader resolves", async () => {
    const deferred = buildDeferredLoader();
    const jobs = new LoadJobService(deferred.loader);
    const job = jobs.start([PETR4]);

    deferred.resolve([ENTRY]);
    await job.done;

    expect(job.state).toBe("finished");
    expect(job.entries).toStrictEqual([ENTRY]);
    expect(job.finishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
  });

  it("marks the load failed with the error when the loader rejects", async () => {
    const deferred = buildDeferredLoader();
    const jobs = new LoadJobService(deferred.loader);
    const job = jobs.start([PETR4]);

    deferred.reject(new Error("Yahoo answered with a rate limit"));
    await job.done;

    expect(job.state).toBe("failed");
    expect(job.error).toBe("Yahoo answered with a rate limit");
  });

  it("starts a new load for the same requirements once the earlier one has finished", async () => {
    const deferred = buildDeferredLoader();
    const jobs = new LoadJobService(deferred.loader);
    const first = jobs.start([PETR4]);
    deferred.resolve([ENTRY]);
    await first.done;

    const second = jobs.start([PETR4]);

    expect(second.id).not.toBe(first.id);
    expect(deferred.calls).toHaveLength(2);
  });

  it("returns undefined for an id the process does not know", () => {
    const jobs = new LoadJobService(buildDeferredLoader().loader);

    expect(jobs.get("no-such-id")).toBeUndefined();
  });
});

describe("LoadJobService.waitUpTo()", () => {
  it("returns true at once when the load has already finished", async () => {
    const deferred = buildDeferredLoader();
    const jobs = new LoadJobService(deferred.loader);
    const job = jobs.start([PETR4]);
    deferred.resolve([ENTRY]);
    await job.done;

    await expect(LoadJobService.waitUpTo(job, 1000)).resolves.toBe(true);
  });

  it("returns true when the load finishes before the threshold", async () => {
    const deferred = buildDeferredLoader();
    const jobs = new LoadJobService(deferred.loader);
    const job = jobs.start([PETR4]);
    const waiting = LoadJobService.waitUpTo(job, 60_000);

    deferred.resolve([ENTRY]);

    await expect(waiting).resolves.toBe(true);
  });

  it("returns false when the threshold passes first, and leaves the load running", async () => {
    const deferred = buildDeferredLoader();
    const jobs = new LoadJobService(deferred.loader);
    const job = jobs.start([PETR4]);

    await expect(LoadJobService.waitUpTo(job, 5)).resolves.toBe(false);
    expect(job.state).toBe("running");
  });
});

describe("LoadJobService.describe()", () => {
  it("names each market, ticker and category of the load", () => {
    const jobs = new LoadJobService(buildDeferredLoader().loader);
    const job = jobs.start([PETR4, VALE3]);

    expect(LoadJobService.describe(job)).toBe("BR:PETR4 quotes, BR:VALE3 quotes");
  });
});
