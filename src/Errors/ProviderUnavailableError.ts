export class ProviderUnavailableError extends Error {
  constructor(details: string) {
    super(`No provider can serve this request: ${details}`);
    this.name = "ProviderUnavailableError";
  }
}
