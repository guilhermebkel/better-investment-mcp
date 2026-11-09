export class UnhealthyError extends Error {
  constructor() {
    super("HTTP mode is set but GET /health did not answer ok.");
    this.name = "UnhealthyError";
  }
}
