export const ANALYSIS_GUIDE = `# Analysis guide

## Where an analysis theme is in the filings

The item titles follow the FRE form. Find an item by its number with \`item = '<number>'\`, which CVM's form gives (topic \`fre\`); the label is the company's file name.

- Business, products, segments, markets and competition: FRE items 1.2 to 1.5; competition risks in 4.1.
- History: FRE 1.1. Regulation: FRE 1.6 and 1.8.
- ESG: FRE 1.9, and document_type 'sustainability' (the integrated and ISSB reports).
- Risks: FRE 4 and 5. Control and governance: FRE 6 and 7. Pay: FRE 8.
- Employees and unions: FRE 10, unions in 10.4. Related parties: FRE 11.
- The directors' comments on results, margins and debt: FRE 2.
- Notes to the financial statements of a DFP or ITR: section \`NotasExplicativas\`, read from the XML of the zip (issue #61); the rendered PDF may lack them. The numbers are in asset_metrics, not in the text.
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

- sources: which provider serves what, and the sector series.
- sql: the tables and the filter rule.
`;
