export class UnknownCommandError extends Error {
  constructor() {
    super("Unknown command. Run without a command to start the server, or with init to print the client configuration.");
    this.name = "UnknownCommandError";
  }
}
