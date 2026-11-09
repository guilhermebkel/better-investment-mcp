# Adding a data source

A source is a vendor that fills one or more tables. One adapter serves one vendor and implements one or more provider contracts, one per category (`docs/adr/0005-one-provider-interface-per-data-category.md`). The contracts are the `*ProviderProtocol.ts` files in `src/Protocols/`; the registry (`ProviderRegistryService`) and the loader (`LoaderService`) are built, so a new adapter plugs in without changing them. In order:

1. Record the decision to add the source in an ADR (date, decision).
2. Use the provider contract of the category in `src/Protocols/`. A new category needs an ADR, an entry between the provider markers in `docs/product/architecture.md` and an entry in `scripts/source-coverage.json`. Change the entry of an existing provider from `planned` to `implemented` when its first adapter lands, with the reason.
3. Create the adapter in `src/Adapters/<Vendor>/`, with a class that implements the contract: `vendor`, `markets`, `assetTypes` and `fetchTables(request)`. Requests go through `HttpAdapter` (`src/Adapters/Http/HttpAdapter.ts`), built with the vendor's host list and, where the vendor needs it, a larger `maxBytes`. The vendor's SDK, if any, is imported only in that folder.
4. Parse every response with a Zod schema from `src/Schemas/`. A changed shape fails the load with the vendor's name in the error, and nothing is written.
5. Map the response to the table columns, with no `source` column: the provider result names the vendor, and the load records it in `cache_runs`. Keep a value you cannot map visible as unmapped; never drop or guess it. A row must carry the market, ticker or series of the request: the loader refuses rows for another asset.
6. Register the adapter in the vendor catalog (`CategoryToVendors` in `src/Protocols/ProviderProtocol.ts`, built in a service, never in `src/Setup/`, which does not import adapters). Add the vendor to the table in `docs/product/architecture.md` and its columns to `docs/product/data-map.md`.
7. Fixtures: recorded responses in `src/Testing/fixtures/`. Tests never call the network: a `HttpAdapter` test uses a local server, and a loader test uses `FakeProvider` from `src/Testing/`.
8. Document the setting value in the README configuration table: `INVESTMENT_MCP_<CATEGORY>_PROVIDER` takes `BR:vendor` for the primary and `BR:primary>fallback` when a fallback is set.
9. Run `pnpm source:drift` and `pnpm check:changed`.
