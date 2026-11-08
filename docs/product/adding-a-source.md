# Adding a data source

A source is a vendor that fills one or more tables. One adapter serves one vendor and implements one or more provider interfaces (`docs/adr/0005-one-provider-interface-per-data-category.md`). The registry and the loader arrive in issue #5; the steps below are the plan for them. In order:

1. Read the vendor's terms for automated access and record the result in an ADR (date, what the terms say, decision). If they forbid it or are unclear, stop and ask the owner.
2. Find the provider interface in `src/Protocols/` for the category. A new category needs an ADR, an entry between the provider markers in `docs/product/architecture.md` and an entry in `scripts/source-coverage.json`. Change the entry of an existing provider from `planned` to `implemented` when its first adapter lands, with the reason.
3. Create the adapter in `src/Adapters/<Vendor>/`. Requests go through the shared `HttpAdapter` with the vendor's host in the allow-list; the vendor's SDK, if any, is imported only there.
4. Parse every response with a Zod schema from `src/Schemas/`. A changed shape fails with a "format changed" error and writes nothing.
5. Map the response to the table columns, with `source` set to the vendor's name. Keep a value you cannot map visible as unmapped; never drop or guess it.
6. Add the vendor to the table in `docs/product/architecture.md` and the columns to `docs/product/data-map.md`.
7. Fixtures: recorded responses in `src/Testing/fixtures/`. Tests never call the network.
8. Add the env var value to the README configuration table (`INVESTMENT_MCP_<CATEGORY>_PROVIDER`).
9. Run `pnpm source:drift` and `pnpm check:changed`.
