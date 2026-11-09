export class UnknownCommandError extends Error {
  constructor() {
    super("Unknown command. Run without a command to start the server, or with init to print the client configuration, or with health to check the HTTP server.");
    this.name = "UnknownCommandError";
  }
}
