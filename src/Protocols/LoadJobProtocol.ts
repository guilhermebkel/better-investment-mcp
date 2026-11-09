import type { LoadedEntry } from "@/Protocols/LoaderProtocol.ts";
import type { Requirement } from "@/Protocols/SqlGuardProtocol.ts";

export type LoadJobState = "running" | "finished" | "failed";

export type LoadJobRegistry = {
  start(requirements: readonly Requirement[]): LoadJob;
  get(id: string): LoadJob | undefined;
};

export type LoadJob = {
  id: string;
  key: string;
  requirements: readonly Requirement[];
  state: LoadJobState;
  startedAt: string;
  finishedAt?: string;
  entries?: LoadedEntry[];
  error?: string;
  done: Promise<void>;
};
