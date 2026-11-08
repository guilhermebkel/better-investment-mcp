export class StoreUnavailableError extends Error {
  constructor(details: string) {
    super(`The cache store is unavailable: ${details}`);
    this.name = "StoreUnavailableError";
  }
}
