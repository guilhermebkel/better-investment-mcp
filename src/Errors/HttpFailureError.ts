export class HttpFailureError extends Error {
  constructor(details: string) {
    super(`The vendor did not answer: ${details}`);
    this.name = "HttpFailureError";
  }
}
