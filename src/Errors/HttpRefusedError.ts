export class HttpRefusedError extends Error {
  constructor(details: string) {
    super(`The HTTP request was refused: ${details}`);
    this.name = "HttpRefusedError";
  }
}
