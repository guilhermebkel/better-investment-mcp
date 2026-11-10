import type { CallbackPort, CallbackSend, LoadNotice } from "@/Protocols/CallbackProtocol.ts";

const REDIRECT_MIN_STATUS = 300;
const REDIRECT_MAX_STATUS = 400;

export class CallbackAdapter implements CallbackPort {
  // Why: a notice is one short request; a callback that does not answer in this time is reported as not received, so a load never waits for it.
  static readonly TIMEOUT_MS = 10_000;
  static readonly PROTOCOL = "https:";

  private readonly send: CallbackSend;

  constructor(send: CallbackSend = (url, init) => fetch(url, init)) {
    this.send = send;
  }

  async post(url: string, notice: LoadNotice): Promise<void> {
    const parsed = URL.parse(url);
    if (parsed?.protocol !== CallbackAdapter.PROTOCOL) {
      throw new Error("the callback address is not https; no notice was sent");
    }
    // Why: only the host is named in a message or a log line; the path and the query can hold a token of the receiver.
    const host = parsed.host;
    let response: Response;
    try {
      response = await this.send(url, {
        method: "POST",
        redirect: "manual",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notice),
        signal: AbortSignal.timeout(CallbackAdapter.TIMEOUT_MS),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.name : "unknown error";
      throw new Error(`the callback at ${host} was not reached (${reason})`, { cause: error });
    }
    // Why: a redirect is not followed, so a notice cannot be sent to an address the caller did not give.
    await response.body?.cancel();
    if (response.status >= REDIRECT_MIN_STATUS && response.status < REDIRECT_MAX_STATUS) {
      throw new Error(`the callback at ${host} redirected the notice, and redirects are not followed`);
    }
    if (!response.ok) {
      throw new Error(`the callback at ${host} answered ${response.status}; the notice was not accepted`);
    }
  }
}
