# Tesouro Direto and the BCB Focus survey are sources

Date: 2026-11-08.

The personal portfolio analysis needs two public sources that no adapter reads yet: the Tesouro Direto prices and rates, and the market expectations of the BCB Focus survey (issue #28 is the CVM epic; this decision is outside it).

## Decision

- Two categories, each with one provider contract and one adapter: `treasury` (`TreasuryProvider`, Tesouro Transparente, `tesouro`) and `expectations` (`ExpectationsProvider`, the BCB Olinda Focus service, `bcb`). The adapters are `TesouroAdapter` and `BcbFocusAdapter`.
- Two tables: `treasury_prices` (per bond family and base date) and `market_expectations` (per indicator, survey date, reference year and calculation base).
- A table that is loaded per value of one key column (`series`, `bond_type`, `indicator`) is a keyed table. `SqlGuardService.TABLE_TO_KEYED_SOURCE` names its key column and its registry market, and the loader replaces only the rows of the key it loads. `macro_series` already worked this way; the rule now serves the three tables.
- Each file or service answer is read whole, parsed with a strict format check (the Tesouro header and decimal comma; the Focus Zod schema), and any unexpected value fails the load with the source named. Nothing is guessed or dropped.
- Store schema version 4. The cache is disposable, so the file is rebuilt on the first run after the upgrade.

## Not decided here

- The B3 site routes (`sistemaswebb3-listados`) are undocumented. The ISIN and the ticker-to-CNPJ link through them are not used.
- COTAHIST waits for the owner's decision on its licence terms.
- PTAX by currency, the CVM company and fund registries, the daily NAV and the holdings of funds are not built. Each needs its own table and its own decision.
