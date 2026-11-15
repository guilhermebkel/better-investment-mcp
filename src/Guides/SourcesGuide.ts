export const SOURCES_GUIDE = `# Sources guide

Each answer says what was loaded, with its period and the error if any.

## Which public provider serves what

- Quotes: Yahoo Finance through yfinance, for BR and US tickers. For a BR ticker that yfinance fails on, B3's daily file (COTAHIST) is the fallback; it has no adjusted close. Yahoo is unofficial, for personal use, with no service guarantee.
- Dividends and splits: Yahoo Finance through yfinance, for BR and US tickers.
- Fundamentals: StatusInvest. The site may block the requests; a blocked load says so and writes nothing.
- Statements, company filings, fund files and FRE, VLMO, CGVN: CVM open data.
- Sustainability reports: the CVM filings whose category is "Relatório de Sustentabilidade", "Relato Integrado" or the ISSB sustainability report. Coverage is partial: a company that CVM does not file in those categories has none here, and the company needs a CNPJ.
- Investor relations content: the CVM filings in the categories "Calendário de Eventos Corporativos", "Fato Relevante", and "Comunicado ao Mercado" with the category type "Apresentações a analistas/agentes do mercado" or "Esclarecimentos sobre questionamentos da CVM/B3". Filter asset_filings by category_type to tell them apart.
- Company and fund registry, and the B3 identifiers (CNPJ, ISIN): CVM and B3. A stock's IR site, activity and previous legal name come from CVM's FCA form.
- Sector series (IBGE): the number of companies by CNAE 2.0 code, yearly, for the asset BR:sector:<code>. The code is a CNAE 2.0 code as IBGE writes it, at section, division, group or class level (10, 29.10-7); a code that is not a category of IBGE table 6449 fails the load and names the code. The server does not link a stock to a CNAE: choose the code from the company's sector (asset.sector) and its FCA activity (asset_attribute activity_description and activity_sector). A holding's activity may differ from its operating companies'. The attribution of IBGE is not yet quoted here.
- Index membership (B3): the weight of a stock in the ISE, ICO2 and IDIVERSA indexes, of the current portfolio only. The IGPTW index is blocked on this server.
- Sanctioning proceedings (CVM, ODbL): a defendant is linked to a stock only when its name equals the company's name or previous legal name; no other match is made.
- Analyst consensus (price targets, recommendations, earnings estimates): not available. No free official source publishes it, and Yahoo's terms allow personal use only. The BCB Focus survey covers macro expectations, not companies.
- Margins against international peers: not available, because the server has no foreign company data.
- Macro series and PTAX exchange rates: BCB open data. Market expectations (Focus): BCB open data.
- Treasury bonds: Tesouro Transparente, one bond per asset_id (family and maturity, for example SELIC_2029-03-01).

## Analysis themes in the filings

The filing items for each theme (business, risks, pay, guidance) are in get_guide topic "analysis".

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
