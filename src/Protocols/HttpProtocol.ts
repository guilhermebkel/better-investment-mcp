export type HeaderNameToValue = Readonly<Record<string, string>>;
export type FieldNameToValue = Readonly<Record<string, string>>;

export type HttpOptions = {
  allowedHosts: readonly string[];
  headers?: HeaderNameToValue;
  maxBytes?: number;
  timeoutMs?: number;
  retryDelayMs?: number;
};

export type HttpPort = {
  getText(url: string, encoding?: string, requestHeaders?: HeaderNameToValue): Promise<string>;
  getCookies(url: string): Promise<string[]>;
  getBytes(url: string): Promise<Uint8Array>;
  downloadToFile(url: string, filePath: string): Promise<number>;
  postForm(url: string, fieldToValue: FieldNameToValue): Promise<string>;
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
