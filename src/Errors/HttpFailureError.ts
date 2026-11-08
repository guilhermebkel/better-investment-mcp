export class HttpFailureError extends Error {
  readonly status: number | undefined;

  constructor(details: string, status?: number) {
    super(`The vendor did not answer: ${details}`);
    this.name = "HttpFailureError";
    this.status = status;
  }
}
