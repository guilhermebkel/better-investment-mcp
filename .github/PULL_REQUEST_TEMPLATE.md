## What and why

<!-- One or two sentences. -->

## Linked issue

<!-- Closes #123. One pull request closes one issue. -->

## How I tested it

<!-- `pnpm check:changed` is the minimum; CI runs the full `pnpm check`. If you touched how the server starts, say which way you ran it: node or npx (Docker once it exists). -->

- [ ] The acceptance criteria of the issue are met
- [ ] `pnpm check:changed` passes
- [ ] New behavior has a test next to the file it tests
- [ ] New output paths are redacted and tested with a fake secret
- [ ] A new tool follows "Before merging a tool" in `docs/mcp-standards.md`: read-only, strict schema, description
- [ ] A new data source follows `docs/product/adding-a-source.md`, and `scripts/source-coverage.json` classifies it
- [ ] The README was reviewed when a tool was added or removed (`pnpm check:tool-docs` checks names and numbers; the wording is review only)

## Checklist

- [ ] No API key, token or account data anywhere in the diff
- [ ] Docs, `GLOSSARY.md` or an ADR updated if behavior or vocabulary changed
- [ ] If packaging changed, `pnpm smoke` passes through `node` and through `npx` (and `docker run -i` once the Docker image exists)
