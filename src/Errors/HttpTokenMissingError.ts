export class HttpTokenMissingError extends Error {
  constructor() {
    super(
      "HTTP mode needs a bearer token on every address. "
      + "Set INVESTMENT_MCP_HTTP_TOKEN to the secret clients must send.",
    );
    this.name = "HttpTokenMissingError";
  }
}
