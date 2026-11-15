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
- Sector series (IBGE): the number of companies by CNAE 2.0 class, yearly, for the sector asset BR:sector:<code>. The attribution of IBGE is not yet quoted here.
- Index membership (B3): the weight of a stock in the ISE, ICO2 and IDIVERSA indexes, of the current portfolio only. The IGPTW index is blocked on this server.
- Sanctioning proceedings (CVM, ODbL): a defendant is linked to a stock only when its name equals the company's name or previous legal name; no other match is made.
- Macro series and PTAX exchange rates: BCB open data. Market expectations (Focus): BCB open data.
- Treasury bonds: Tesouro Transparente, one bond per asset_id (family and maturity, for example SELIC_2029-03-01).

## Where an analysis theme is in the filings

The item titles follow the FRE form, and the labels are the company's file names, so search by item number (\`split_part(split_part(section, ' ', 2), '_', 1)\`).

- Business, products, segments, markets and competition: FRE items 1.2 to 1.5; competition risks in 4.1.
- History: FRE 1.1. Regulation: FRE 1.6 and 1.8.
- ESG: FRE 1.9, and document_type 'sustainability' (the integrated and ISSB reports).
- Risks: FRE 4 and 5. Control and governance: FRE 6 and 7. Pay: FRE 8.
- Employees and unions: FRE 10, unions in 10.4. Related parties: FRE 11.
- The directors' comments on results, margins and debt: FRE 2. The numbers are in asset_metrics, not in the text.
- Guidance: FRE 3. Events: document_type 'material_fact', and 'other' by category.
- FII reports: document_type 'management_report'. A stock has none.

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
