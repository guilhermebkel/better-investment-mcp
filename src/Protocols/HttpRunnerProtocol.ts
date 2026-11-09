import type { IncomingMessage, ServerResponse } from "node:http";

export type HttpServerHandle = {
  url: string;
  close: () => Promise<void>;
};

export type HttpSessions = {
  handleRequest(request: IncomingMessage, response: ServerResponse, parsedBody: unknown): Promise<void>;
  closeAll(): Promise<void>;
};

export type HttpContext = {
  auth: { verifyRequest(request: IncomingMessage): boolean };
  sessions: HttpSessions;
};
