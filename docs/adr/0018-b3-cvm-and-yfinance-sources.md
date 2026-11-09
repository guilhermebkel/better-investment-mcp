# B3, CVM, PTAX and yfinance as sources

Date: 2026-11-09.

The source map (issue of the personal analysis) asks for B3 identifiers and quotes, the CVM company and fund files, the BCB PTAX rate per currency, and the yfinance library for prices. The repository rule against running commands from `src/` was removed (the AGENTS.md update), so the yfinance library runs through `python3`.

## Decision

- **B3 identifiers** (`asset_identifiers`): a ticker is resolved in two steps, as the B3 site does. A listing filters it to one company or fund, then the detail gives the CNPJ and, for a stock, the ISIN. A fund's detail must list the ticker asked, in its trading code or other codes.
- **B3 quotes** (`quotes`, provider `b3`): the yearly COTAHIST file is streamed from a temporary directory. Only spot-market records with unit factor are loaded; a price in a lot of a thousand is not divided, because the layout does not say whether its price already includes the factor. The current year and the one before are read.
- **yfinance** (`quotes` and `dividends`, vendor `yfinance`): the library runs as `python3 -I` with a script held in the TypeScript file. The symbol is an argument, never a shell string. A missing library fails with the install command. yfinance worked where the Yahoo adapter's own requests were answered with 429.
- **CVM registry** (`company_registry`): a stock's legal name, sector and situation from CVM's company file, found by the CNPJ the ticker resolves to.
- **CVM funds** (`fund_registry`, `fund_daily`, `fund_holdings`): keyed by the CNPJ of a fund class. CVM's fund files cover FI, FIDC and FIF; a FII is not in them. The monthly files of the last twelve months are downloaded to a temporary file and streamed; a month not yet published has no rows.
- **BCB PTAX** (`fx_rates`): the closing bulletin of each day for a currency. A day with two closing bulletins (the service reissues one) keeps the later one.

## Not decided here

- StatusInvest: the site answers with a Cloudflare challenge, which headless Chromium does not pass. The server does not bypass it. Fundamentals and FII monthly data from StatusInvest stay blocked.
- Packaging: the yfinance path needs `python3` and the `yfinance` package on the machine that runs the server. The npm package does not install them.
