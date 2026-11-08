export type HttpOptions = {
  allowedHosts: readonly string[];
  maxBytes?: number;
  timeoutMs?: number;
  retryDelayMs?: number;
};

export type HttpPort = {
  getText(url: string, encoding?: string): Promise<string>;
  getBytes(url: string): Promise<Uint8Array>;
  postForm(url: string, fieldToValue: Readonly<Record<string, string>>): Promise<string>;
};

export type HttpAnswer = {
  isAnswered: true;
  bytes: Uint8Array;
};

export type HttpTemporaryFailure = {
  isAnswered: false;
  reason: string;
  status?: number;
};

export type HttpAttempt = HttpAnswer | HttpTemporaryFailure;
