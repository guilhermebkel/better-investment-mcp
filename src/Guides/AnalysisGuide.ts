export const ANALYSIS_GUIDE = `# Analysis guide

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

## See also

- sources: which provider serves what, and the sector series.
- sql: the tables and the filter rule.
`;
