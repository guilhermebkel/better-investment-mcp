import type { CallbackPort } from "@/Protocols/CallbackProtocol.ts";
import type { LoadJobSubscriber } from "@/Protocols/LoadJobProtocol.ts";

export type NotifyLoadFinishInput = {
  loading_id: string;
  callback_url: string;
};

export type NotifyLoadFinishDependencies = {
  jobs: LoadJobSubscriber;
  callback: CallbackPort;
};
