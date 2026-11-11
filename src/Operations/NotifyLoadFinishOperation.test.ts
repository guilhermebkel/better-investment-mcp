import { describe, expect, it } from "vitest";
import type { CallbackPort, LoadNotice } from "@/Protocols/CallbackProtocol.ts";
import type { LoadJob, LoadNoticeListener, LoadJobSubscriber, SubscribeOutcome } from "@/Protocols/LoadJobProtocol.ts";
import { NotifyLoadFinishOperation } from "@/Operations/NotifyLoadFinishOperation.ts";

const CALLBACK_URL = "https://receiver.example.com/hooks/SECRET-TOKEN-123";
const LOADING_ID = "load-1";

type Fake = {
  jobs: LoadJobSubscriber;
  posts: Post[];
  callback: CallbackPort;
  subscribed: number;
  listener: { current?: LoadNoticeListener };
};

type Post = {
  url: string;
  notice: LoadNotice;
};

const buildFake = (outcome: SubscribeOutcome, failPost = false): Fake => {
  const posts: Post[] = [];
  const fake: Fake = {
    posts,
    subscribed: 0,
    listener: {},
    jobs: {
      subscribe: (_id, listener) => {
        fake.subscribed += 1;
        fake.listener.current = listener;
        return outcome;
      },
    },
    callback: {
      post: (url, notice) => {
        posts.push({ url, notice });
        return failPost ? Promise.reject(new Error("the callback at receiver.example.com answered 500")) : Promise.resolve();
      },
    },
  };
  return fake;
};

const FINISHED_JOB: LoadJob = {
  id: LOADING_ID,
  key: "k",
  requirements: [],
  state: "finished",
  startedAt: "2026-11-11T00:00:00.000Z",
  finishedAt: "2026-11-11T00:00:05.000Z",
  entries: [{ category: "quotes", market: "BR", ticker: "PETR4", status: "loaded", isFallback: false, rowsWritten: 731 }],
  done: Promise.resolve(),
};

describe("NotifyLoadFinishOperation.execute()", () => {
  it("refuses an address that is not https, and does not look up the load", async () => {
    const fake = buildFake("registered");

    const result = await new NotifyLoadFinishOperation({ jobs: fake.jobs, callback: fake.callback }).execute({ loading_id: LOADING_ID, callback_url: "http://receiver.example.com/hook" });

    expect(result.isError).toBe(true);
    expect(fake.subscribed).toBe(0);
  });

  it("says that the notice is set, with the host and not the path", async () => {
    const fake = buildFake("registered");

    const operation = new NotifyLoadFinishOperation({ jobs: fake.jobs, callback: fake.callback });
    const result = await operation.execute({ loading_id: LOADING_ID, callback_url: CALLBACK_URL });

    expect(result.isError).toBe(false);
    expect(result.message).toContain("receiver.example.com");
    expect(result.message).not.toContain("SECRET-TOKEN-123");
  });

  it("names an unknown loading id as an error", async () => {
    const fake = buildFake("unknown");

    const result = await new NotifyLoadFinishOperation({ jobs: fake.jobs, callback: fake.callback }).execute({ loading_id: "nope", callback_url: CALLBACK_URL });

    expect(result.isError).toBe(true);
    expect(result.message).toContain("No load has the loading id nope");
  });

  it("sends the notice of a load that already finished, at once", async () => {
    const fake = buildFake("done");
    const operation = new NotifyLoadFinishOperation({ jobs: fake.jobs, callback: fake.callback });

    await operation.execute({ loading_id: LOADING_ID, callback_url: CALLBACK_URL });
    await fake.listener.current?.(FINISHED_JOB);

    expect(fake.posts).toHaveLength(1);
    expect(fake.posts[0]?.url).toBe(CALLBACK_URL);
    expect(fake.posts[0]?.notice.status).toBe("loaded");
  });

  it("does not throw when the callback fails; the failure is logged, not returned", async () => {
    const fake = buildFake("registered", true);
    const operation = new NotifyLoadFinishOperation({ jobs: fake.jobs, callback: fake.callback });
    await operation.execute({ loading_id: LOADING_ID, callback_url: CALLBACK_URL });

    await expect(fake.listener.current?.(FINISHED_JOB)).resolves.toBeUndefined();
  });
});

describe("NotifyLoadFinishOperation.buildNotice()", () => {
  it("carries the loads and their rows, and no values", () => {
    const notice = NotifyLoadFinishOperation.buildNotice(FINISHED_JOB);

    expect(notice).toStrictEqual({
      loadingId: LOADING_ID,
      status: "loaded",
      finishedAt: "2026-11-11T00:00:05.000Z",
      loads: [{ category: "quotes", market: "BR", ticker: "PETR4", status: "loaded", rowsWritten: 731 }],
    });
  });

  it("says failed when a load entry failed, and carries the error", () => {
    const notice = NotifyLoadFinishOperation.buildNotice({
      ...FINISHED_JOB,
      entries: [{ category: "documents", market: "BR", ticker: "VALE3", status: "failed", isFallback: false, rowsWritten: 0, error: "the CVM link answered with a web page" }],
    });

    expect(notice.status).toBe("failed");
    expect(notice.loads[0]?.error).toBe("the CVM link answered with a web page");
  });

  it("says failed, with the job error, when the whole load failed", () => {
    const notice = NotifyLoadFinishOperation.buildNotice({ ...FINISHED_JOB, state: "failed", entries: undefined, error: "CVM is down" });

    expect(notice.status).toBe("failed");
    expect(notice.error).toBe("CVM is down");
    expect(notice.loads).toStrictEqual([]);
  });
});
