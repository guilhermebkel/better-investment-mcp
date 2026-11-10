import type { LoadedEntry } from "@/Protocols/LoaderProtocol.ts";

export type LoadNoticeEntry = {
  category: string;
  market: string;
  ticker: string;
  status: LoadedEntry["status"];
  rowsWritten: number;
  error?: string;
};

export type LoadNotice = {
  loadingId: string;
  status: "loaded" | "failed";
  finishedAt: string;
  error?: string;
  loads: LoadNoticeEntry[];
};

export type CallbackSend = (url: string, init: RequestInit) => Promise<Response>;

export type CallbackPort = { post(url: string, notice: LoadNotice): Promise<void> };
