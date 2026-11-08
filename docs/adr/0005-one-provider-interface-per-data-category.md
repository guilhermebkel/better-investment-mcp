# One provider interface per data category, one adapter per vendor

Each category of data has one interface (`QuoteProvider`, `DividendProvider`, `FundamentalsProvider`, `StatementProvider`, `FundDataProvider`, `FilingProvider`, `DocumentProvider`, `MacroProvider`). A vendor is an adapter that implements one or more of them. An environment variable per category maps each market to a vendor, for example `INVESTMENT_MCP_QUOTES_PROVIDER=BR:yahoo,US:yahoo`.

## Considered options

- One adapter per vendor with its own tables: rejected. Changing a vendor would change the table the agent reads.
- One fixed vendor per category in code: rejected. Yahoo has no SLA and StatusInvest has no official API, so the user must be able to switch.

## Consequences

- Every row keeps the `source` that produced it, so the agent can tell which vendor a number came from.
- A new vendor is a new adapter and a new value of the environment variable (`docs/product/adding-a-source.md`); the tables do not change.
- `scripts/source-coverage.json` lists every provider with a status, so a provider cannot be forgotten.
