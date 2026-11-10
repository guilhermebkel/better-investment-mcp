import { describe, expect, it } from "vitest";
import type { LoadNotice } from "@/Protocols/CallbackProtocol.ts";
import { CallbackAdapter } from "@/Adapters/Callback/CallbackAdapter.ts";

const NOTICE: LoadNotice = { loadingId: "load-1", status: "loaded", finishedAt: "2026-11-11T00:00:00.000Z", loads: [] };
const SECRET_PATH = "/hooks/SECRET-TOKEN-123";
const CALLBACK_URL = `https://receiver.example.com${SECRET_PATH}?key=SECRET-QUERY-456`;

type Sent = {
  url: string;
  init: RequestInit;
};

const buildSend = (answer: () => Response | Promise<Response>): {
  send: (url: string, init: RequestInit) => Promise<Response>;
  sent: Sent[];
} => {
  const sent: Sent[] = [];
  return {
    sent,
    send: (url, init) => {
      sent.push({ url, init });
      return Promise.resolve(answer());
    },
  };
};

describe("CallbackAdapter.post()", () => {
  it("sends one POST with the notice as JSON to the address given", async () => {
    const { send, sent } = buildSend(() => new Response(null, { status: 204 }));

    await new CallbackAdapter(send).post(CALLBACK_URL, NOTICE);

    expect(sent).toHaveLength(1);
    const [first] = sent;
    const body = typeof first?.init.body === "string" ? first.init.body : "";
    expect(first?.url).toBe(CALLBACK_URL);
    expect(first?.init.method).toBe("POST");
    expect(first?.init.redirect).toBe("manual");
    expect(JSON.parse(body)).toStrictEqual(NOTICE);
  });

  it("refuses an address that is not https, and sends nothing", async () => {
    const { send, sent } = buildSend(() => new Response(null, { status: 204 }));

    await expect(new CallbackAdapter(send).post("http://receiver.example.com/hook", NOTICE)).rejects.toThrow("not https");
    expect(sent).toHaveLength(0);
  });

  it("does not follow a redirect, and says so", async () => {
    const { send } = buildSend(() => new Response(null, { status: 302, headers: { Location: "https://elsewhere.example.com/" } }));

    await expect(new CallbackAdapter(send).post(CALLBACK_URL, NOTICE)).rejects.toThrow("redirects are not followed");
  });

  it("reports a refused answer with its status", async () => {
    const { send } = buildSend(() => new Response(null, { status: 500 }));

    await expect(new CallbackAdapter(send).post(CALLBACK_URL, NOTICE)).rejects.toThrow("answered 500");
  });

  it("names only the host when the address cannot be reached, never its path or query", async () => {
    const error = new TypeError("fetch failed");
    const { send } = buildSend(() => Promise.reject(error));

    const failure = new CallbackAdapter(send).post(CALLBACK_URL, NOTICE);

    await expect(failure).rejects.toThrow("receiver.example.com");
    await expect(failure).rejects.not.toThrow("SECRET");
  });
});
