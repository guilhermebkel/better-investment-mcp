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
- Complaints (Consumidor.gov.br, monthly from 2021-08): found by a term, not by a ticker, as BR:complaints:<TERM>; trade_name shows what matched. One company has several trade names, and a term can match another company: PETROBRAS matches \`Postos Petrobras (Vibra Energia)\`. B2B companies have none.
- Bank size (BCB IF.data, quarterly, ODbL, attribution Banco Central do Brasil, IFData): banking.total_assets and banking.credit_portfolio (brl), and their _share (percent of the file), for a listed bank's group, linked by the CNPJ root.
- News (GDELT DOC 2.0, the last 3 months): BR:news:<TERM>; a term can match other companies. Use must cite the GDELT Project with a link to gdeltproject.org.
- Sanctioning proceedings (CVM, ODbL): a defendant is linked to a stock only when its name equals the company's name or previous legal name; no other match is made.
- Analyst consensus (price targets, recommendations, earnings estimates): not available. No free official source publishes it, and Yahoo's terms allow personal use only. The BCB Focus survey covers macro expectations, not companies.
- Margins against international peers: not available, because the server has no foreign company data.
- Macro series and PTAX exchange rates: BCB open data. Market expectations (Focus): BCB open data.
- Treasury bonds: Tesouro Transparente, one bond per asset_id (family and maturity, for example SELIC_2029-03-01).

## Analysis themes in the filings

The filing items for each theme, the quality flags and the units are in get_guide topic "analysis".

## See also

- sql: the tables and the filter rule.
- limits: what the server keeps and for how long.
`;
