export const SOURCES_GUIDE = `# Sources guide

Each answer says what was loaded, with its period and the error if any. It does not name the vendor that served it.

## Which vendor serves what

- Yahoo Finance (source yahoo): quotes, splits, dividends and the asset summary (assets) for BR and US tickers. Unofficial, for personal use, no service guarantee.
- BCB SGS (source bcb): macro_series for the series ipca, cdi, selic, ptax and igpm. Open data.
- StatusInvest (source statusinvest): fundamentals and fii_monthly. The site may block the requests; a blocked load says so and writes nothing.
- CVM (source cvm): filings for a company, from the yearly IPE file. Filing types: material_fact, sustainability and other. Not every ticker has a CVM company yet.
- B3 (source b3): asset_identifiers (CNPJ and ISIN of a ticker); quotes for BR tickers when INVESTMENT_MCP_QUOTES_PROVIDER names b3 (COTAHIST, the current and the previous year, unit-factor prices only).
- CVM company file (source cvm): company_registry, the sector and legal name of a stock.
- CVM FRE, VLMO and CGVN (source cvm): company_disclosures, the rows of a company by dataset (fre, vlmo, cgvn), section, date and version; the whole row is in row_json.
- CVM fund files (source cvm): fund_registry, fund_daily and fund_holdings for a fund CNPJ, the last twelve months.
- BCB PTAX (source bcb): fx_rates, the closing rate per currency and day.
- Tesouro Transparente (source tesouro): treasury_prices for one bond family per load (bond_type), daily prices and rates from 2004. Open data.
- BCB Focus (source bcb): market_expectations for ipca, selic, pib_total and cambio, the annual mean and median of the survey. Open data.

## Quality columns

- quotes.is_stale: the price repeats the day before with zero volume.
- quotes.suspect_tick: one day moved more than 25% and came back within 5% the next day. The row stays.
- adj_close is the vendor's adjusted close; use it for returns across splits and dividends.

## Units

- macro_series.value: ipca is percent per month, cdi is percent per day, selic is percent per year, ptax is BRL per USD, igpm is percent per month.
- treasury_prices: buy_rate and sell_rate are percent per year; the unit prices are reais per bond.
- market_expectations: the mean and median are percent for ipca, selic and pib_total, and reais per dollar for cambio. Old surveys have null for the stats the service did not publish then.
- Amounts are plain numbers in currency units.

## See also

- sql: the tables and the filter rule.
- limits: what the server keeps and for how long.
`;
