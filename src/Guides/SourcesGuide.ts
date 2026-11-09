export const SOURCES_GUIDE = `# Sources guide

Each answer says what was loaded, with its period and the error if any.

## Which public provider serves what

- Quotes: Yahoo Finance through yfinance, for BR and US tickers. For a BR ticker that yfinance fails on, B3's daily file (COTAHIST) is the fallback; it has no adjusted close. Yahoo is unofficial, for personal use, with no service guarantee.
- Dividends and splits: Yahoo Finance through yfinance, for BR and US tickers.
- Fundamentals: StatusInvest. The site may block the requests; a blocked load says so and writes nothing.
- Statements, company filings, fund files and FRE, VLMO, CGVN: CVM open data.
- Sustainability reports: the CVM filings whose category is "Relatório de Sustentabilidade", "Relato Integrado" or the ISSB sustainability report. Coverage is partial: a company that CVM does not file in those categories has none here, and the company needs a CNPJ.
- Company and fund registry, and the B3 identifiers (CNPJ, ISIN): CVM and B3.
- Macro series and PTAX exchange rates: BCB open data. Market expectations (Focus): BCB open data.
- Treasury bonds: Tesouro Transparente, one bond per asset_id (family and maturity, for example SELIC_2029-03-01).

## Quality flags

- quotes.is_stale: the price repeats the day before with zero volume.
- quotes.suspect_tick: one day moved more than 25% and came back within 5% the next day. The row stays.
- adj_close is the vendor's adjusted close; use it for returns across splits and dividends.

## Units

- macro: the unit column says it: percent_per_month for IPCA and IGPM, percent_per_day for CDI, percent_per_year for SELIC.
- treasury.buy_rate and sell_rate are percent per year; the unit prices are reais per bond.
- fx: brl_per_currency. Fund quota: brl_per_quota. Statements and FII reports: brl.
- fundamental: as_published, the unit the source gave.

## See also

- sql: the tables and the filter rule.
- limits: what the server keeps and for how long.
`;
