export class ProviderConfigError extends Error {
  constructor(details: string) {
    super(`Invalid provider setting: ${details}`);
    this.name = "ProviderConfigError";
  }
}
