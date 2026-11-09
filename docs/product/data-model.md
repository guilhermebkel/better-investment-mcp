# Data model

The entities the server keeps in DuckDB, how they relate, and the rules behind their names. The columns and units of each table are in `data-map.md`; the rules that produce this shape are in `docs/data-modelling-standards.md`.

This is the target model. The store is still at the schema of version 8, which has the older names. The move to this model is done in steps, and each step updates `data-map.md`.

The schema has no foreign keys. A relation is **logical**: both sides carry the same `asset_id`, and a query joins them on it.

## Entities

```mermaid
erDiagram
    asset ||--o{ asset_attribute : "asset_id"
    asset ||--o{ asset_quotes : "asset_id"
    asset ||--o{ asset_dividends : "asset_id"
    asset ||--o{ asset_splits : "asset_id"
    asset ||--o{ asset_metrics : "asset_id"
    asset ||--o{ asset_expectations : "asset_id"
    asset ||--o{ asset_holdings : "asset_id (fund)"
    asset ||--o{ asset_filings : "asset_id"
    asset_filings ||--o{ asset_filing_items : "filing_id"
    asset_filings ||--o{ asset_filing_chunks : "filing_id"
    asset_filings ||--o{ asset_metrics : "filing_id (optional)"

    asset {
        VARCHAR asset_id PK
        VARCHAR market
        VARCHAR asset_type
        VARCHAR code
        VARCHAR legal_id
        VARCHAR isin
        VARCHAR name
        VARCHAR trade_name
        VARCHAR sector
        VARCHAR situation
        VARCHAR cvm_code
        VARCHAR currency
    }
    asset_attribute {
        VARCHAR asset_id PK
        VARCHAR attribute PK
        VARCHAR value
    }
    asset_quotes {
        VARCHAR asset_id PK
        DATE reference_time_start PK
        DATE reference_time_end
        DOUBLE close
        DOUBLE volume
    }
    asset_dividends {
        VARCHAR asset_id PK
        DATE ex_time PK
        VARCHAR kind PK
        DATE payment_time
        DOUBLE amount
    }
    asset_splits {
        VARCHAR asset_id PK
        DATE ex_time PK
        DOUBLE ratio
    }
    asset_metrics {
        VARCHAR asset_id PK
        VARCHAR metric PK
        DATE reference_time_start PK
        DATE reference_time_end
        DOUBLE value
        VARCHAR unit
        INTEGER version
        VARCHAR filing_id
    }
    asset_expectations {
        VARCHAR asset_id PK
        DATE reference_time_start PK
        DATE survey_time PK
        INTEGER calculation_base PK
        DOUBLE mean
        DOUBLE median
    }
    asset_holdings {
        VARCHAR asset_id PK
        DATE reference_time_start PK
        VARCHAR block PK
        VARCHAR held_code
        DOUBLE quantity
        DOUBLE market_value
    }
    asset_filings {
        VARCHAR filing_id PK
        VARCHAR asset_id
        VARCHAR document_type
        DATE reference_time_start
        DATE reference_time_end
        TIMESTAMP published_at
        INTEGER version
        VARCHAR url
    }
    asset_filing_items {
        VARCHAR filing_id PK
        VARCHAR section PK
        VARCHAR row_json
    }
    asset_filing_chunks {
        VARCHAR filing_id PK
        INTEGER seq PK
        VARCHAR text
    }
    load_runs {
        VARCHAR run_id PK
        VARCHAR category
        VARCHAR asset_id
        VARCHAR source
    }
    load_files {
        VARCHAR url PK
        VARCHAR sha256 PK
    }
```

## What each entity holds

| Entity | Holds | Key |
| --- | --- | --- |
| `asset` | One row per asset: its identity and the fields every asset may have (CNPJ, ISIN, name, sector, situation). | `asset_id` |
| `asset_attribute` | Descriptors that only some types have (administrator and manager of a fund, class). | `asset_id, attribute` |
| `asset_quotes` | Daily prices and volume of a stock or a FII. | `asset_id, reference_time_start` |
| `asset_dividends` | Proventos, with the ex date and the payment date. | `asset_id, ex_time, kind` |
| `asset_splits` | Stock splits and reverse splits. | `asset_id, ex_time` |
| `asset_metrics` | Every number observed over time: fundamentals, FII monthly values, statement lines, fund quota, Treasury prices and rates, macro indexes, currency rates. | `asset_id, metric, reference_time_start` |
| `asset_expectations` | Market expectations of a macro indicator, by survey. | `asset_id, reference_time_start, survey_time, calculation_base` |
| `asset_holdings` | What a fund holds, by block, with quantity and value. | `asset_id, reference_time_start, block` |
| `asset_filings` | One row per document: ITR, DFP, FRE, IPE and the other CVM and FNET documents. | `filing_id` |
| `asset_filing_items` | Rows of a document that have no single number (FRE, VLMO, CGVN), as JSON. | `filing_id, section` |
| `asset_filing_chunks` | Text of a document, for search. | `filing_id, seq` |
| `load_runs` | Each load: its category, its asset, its source, its time and its error. | `run_id` |
| `load_files` | Each CVM file downloaded, with its hash. | `url, sha256` |

## Asset identifiers

| Asset | `asset_id` |
| --- | --- |
| Stock | `BR:stock:PETR4` |
| FII | `BR:fii:HGLG11` |
| Investment fund | `BR:fund:00.017.024/0001-53` |
| Treasury bond | `BR:treasury:` a normalized family and maturity (the data map lists the rule) |
| Macro index | `BR:index:IPCA` |
| Tax rate | `BR:tax_rate:SELIC` |
| Currency rate | `BR:currency:USD` |

## Queries

A query names the assets it reads by `asset_id`, directly or through a join to `asset`:

```sql
SELECT reference_time_start, close
FROM asset_quotes
WHERE asset_id = 'BR:stock:PETR4' AND reference_time_start >= DATE '2026-01-01'
```

```sql
SELECT a.asset_id, q.reference_time_start, q.close
FROM asset a JOIN asset_quotes q USING (asset_id)
WHERE a.asset_id IN ('BR:stock:PETR4', 'BR:stock:VALE3')
```

A filter on another column, such as the sector, does not name the assets to load, so it is refused.

## Open points

1. **Load scope of a multi-asset load.** A Treasury family or a CNPJ writes several assets in one load. The replacement is by the key of the load, not by one asset. The data map must say, for each multi-asset load, which rows it replaces.
2. **The normalized code of a Treasury bond.** The rule for `+` and for the maturity date is written in the data map before the code.
3. **Migration.** Each old table maps to a new one (see the data map). The old names stay until the step that moves each one.
