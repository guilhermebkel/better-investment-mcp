# Adding an operation

This page is the contract a new tool must meet. A tool is a class in `src/Operations/` and the server has only read-only tools (`docs/adr/0004-no-tool-writes-to-the-outside-world.md`), so a new tool needs an ADR first. The port (`OperationPort` in `src/Protocols/OperationProtocol.ts`) and the manifest (`src/Surfaces/OperationManifestSurface.ts`) are in place. In order:

1. Write the ADR that says why the tool cannot be a `query_sql` query or a guide topic.
2. Create `src/Operations/<Name>Operation.ts` with `static readonly NAME = "<name>"`, `implements OperationPort<Input>` and the members `description`, `inputSchema` and `execute`. Its constructor takes the services it needs.
3. Write its input type in a `<Name>Protocol.ts` file in `src/Protocols/` and its schema in the matching `<Name>Schema.ts` file in `src/Schemas/`, strict and with every field described (`docs/mcp-standards.md`).
4. Write the description in the order `docs/mcp-standards.md` gives; it starts with "Read-only.".
5. Register it in `src/Surfaces/OperationManifestSurface.ts`. The surface reads the manifest and needs no other change.
6. Tests: the operation through the server surface with a fake provider, a fake secret on every output path, and the refusal cases.
7. Update the texts that describe the tools: the list between the `<!-- tools:list -->` markers in `README.md` and the number in the `<!-- tools:count -->` markers in `README.md` and `AGENTS.md`. `pnpm check:tool-docs` checks names and numbers; the wording is review.
8. Run it in a task that needs several calls and read the transcript.
