export type HttpOptions = {
  allowedHosts: readonly string[];
  maxBytes?: number;
  timeoutMs?: number;
  retryDelayMs?: number;
};

export type HttpAnswer = {
  isAnswered: true;
  text: string;
};

export type HttpTemporaryFailure = {
  isAnswered: false;
  reason: string;
};

export type HttpAttempt = HttpAnswer | HttpTemporaryFailure;
