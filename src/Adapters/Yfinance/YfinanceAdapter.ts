import { execFile } from "node:child_process";
import type { ProviderPort, ProviderRequest, ProviderResult, ProviderRow, TableToRows } from "@/Protocols/ProviderProtocol.ts";
import { YfinanceSchema } from "@/Schemas/YfinanceSchema.ts";
import { PeriodService } from "@/Services/PeriodService.ts";
import { QualityFlagService } from "@/Services/QualityFlagService.ts";
import { AssetIdUtil } from "@/Utils/AssetIdUtil.ts";

const PYTHON_TIMEOUT_MS = 180_000;
const BYTES_PER_MIB = 1_048_576;
const MAX_OUTPUT_MIB = 256;
const MAX_OUTPUT_BYTES = MAX_OUTPUT_MIB * BYTES_PER_MIB;
const MAX_MESSAGE_LENGTH = 200;
const MISSING_MODULE = "No module named 'yfinance'";
const SUFFIX_BR = ".SA";
const MARKET_TO_SUFFIX: Readonly<Record<"BR" | "US", string>> = { BR: SUFFIX_BR, US: "" };

// Why: the price history comes from the yfinance library (as the spec asks), run by python3 in isolated mode with a script that lives in this file; the symbol is passed as an argument, never through a shell.
const SCRIPT = [
  "import json, sys",
  "import yfinance as yf",
  "symbol = sys.argv[1]",
  "ticker = yf.Ticker(symbol)",
  "history = ticker.history(period='max', auto_adjust=False, actions=True)",
  "def number(value):",
  "    try:",
  "        result = float(value)",
  "    except (TypeError, ValueError):",
  "        return None",
  "    return None if result != result else result",
  "quotes, dividends, splits = [], [], []",
  "for index, row in history.iterrows():",
  "    day = index.strftime('%Y-%m-%d')",
  "    quotes.append({'date': day, 'open': number(row['Open']), 'high': number(row['High']), 'low': number(row['Low']), 'close': number(row['Close']), 'adjClose': number(row['Adj Close']), 'volume': number(row['Volume'])})",
  "    amount = number(row['Dividends'])",
  "    if amount:",
  "        dividends.append({'exDate': day, 'amount': amount})",
  "    ratio = number(row['Stock Splits'])",
  "    if ratio:",
  "        splits.append({'date': day, 'ratio': ratio})",
  "try:",
  "    info = ticker.get_info() or {}",
  "except Exception:",
  "    info = {}",
  "print(json.dumps({'quotes': quotes, 'dividends': dividends, 'splits': splits, 'currency': info.get('currency'), 'name': info.get('longName') or info.get('shortName')}))",
].join("\n");

export class YfinanceAdapter<Category extends "quotes" | "dividends"> implements ProviderPort<Category> {
  static readonly VENDOR = "yfinance";
  static readonly MARKETS: readonly ("BR" | "US")[] = ["BR", "US"];
  static readonly ASSET_TYPES: readonly ("stock" | "fii" | "etf")[] = ["stock", "fii", "etf"];

  readonly category: Category;
  readonly vendor = YfinanceAdapter.VENDOR;
  readonly markets = YfinanceAdapter.MARKETS;
  readonly assetTypes = YfinanceAdapter.ASSET_TYPES;

  private readonly run: (symbol: string) => Promise<string>;

  constructor(
    category: Category,
    run: (symbol: string) => Promise<string> = (symbol) => YfinanceAdapter.runPython(symbol),
  ) {
    this.category = category;
    this.run = run;
  }

  async fetchTables(request: ProviderRequest): Promise<ProviderResult> {
    if (request.assetType === undefined) {
      throw new Error("yfinance needs the asset type of the asset");
    }
    const symbol = YfinanceAdapter.buildSymbol(request.market, request.ticker);
    const text = await this.run(symbol);
    const tables = YfinanceAdapter.buildTables(YfinanceAdapter.parseOutput(text, symbol), request);
    return { source: YfinanceAdapter.VENDOR, tables };
  }

  static buildSymbol(market: string, ticker: string): string {
    const suffix = Object.hasOwn(MARKET_TO_SUFFIX, market) ? MARKET_TO_SUFFIX[market as "BR" | "US"] : undefined;
    if (suffix === undefined) {
      throw new Error(`yfinance does not map the market ${market} to a symbol`);
    }
    return `${ticker}${suffix}`;
  }

  static parseOutput(text: string, symbol: string) {
    const json: unknown = JSON.parse(text);
    const parsed = YfinanceSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(`the response format changed: yfinance sent an unknown shape for ${symbol}; no row was written`);
    }
    return parsed.data;
  }

  static buildTables(data: ReturnType<typeof YfinanceAdapter.parseOutput>, request: ProviderRequest): TableToRows {
    const assetId = AssetIdUtil.build({ market: request.market, assetType: request.assetType ?? "", code: request.ticker });
    const key = { asset_id: assetId };
    const priced = data.quotes.filter((quote) => quote.close !== null);
    const points = priced.map((quote) => ({ close: quote.close ?? 0, volume: quote.volume ?? 0 }));
    // Why: the library returns the whole history; rows outside the requested period are dropped after the flags are built.
    const flags = QualityFlagService.buildFlags(points);
    const keepInPeriod = (date: string): boolean =>
      request.period === undefined || PeriodService.isWithin(request.period, date);
    const quoteRows: ProviderRow[] = priced.flatMap((quote, index) =>
      keepInPeriod(quote.date)
        ? [{
            ...key,
            reference_time_start: quote.date,
            reference_time_end: quote.date,
            open: quote.open,
            high: quote.high,
            low: quote.low,
            close: quote.close,
            adj_close: quote.adjClose,
            volume: quote.volume,
            is_stale: flags[index]?.isStale ?? false,
            suspect_tick: flags[index]?.isSuspectTick ?? false,
          }]
        : [],
    );
    return {
      asset: [{ ...key, market: request.market, asset_type: request.assetType ?? "", code: request.ticker, name: data.name, currency: data.currency }],
      asset_quotes: quoteRows,
      asset_dividends: data.dividends.filter((dividend) => keepInPeriod(dividend.exDate)).map((dividend) => ({
        ...key, ex_time: dividend.exDate, payment_time: null, amount: dividend.amount, kind: "dividend",
      })),
      asset_splits: data.splits.map((split) => ({
        ...key,
        ex_time: split.date,
        ratio: split.ratio,
      })),
    };
  }

  static runPython(symbol: string): Promise<string> {
    // Why: a missing library is named with the install command, so the operator sees the fix rather than a raw stack.
    return new Promise((resolve, reject) => {
      execFile(
        "python3",
        ["-I", "-c", SCRIPT, symbol],
        { timeout: PYTHON_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES },
        (error, stdout, stderr) => {
          if (error === null) {
            resolve(stdout);
            return;
          }
          const message = stderr.includes(MISSING_MODULE)
            ? "yfinance is not installed for python3; run: pip install yfinance"
            : `yfinance failed for ${symbol}: ${error.message.slice(0, MAX_MESSAGE_LENGTH)}`;
          reject(new Error(message, { cause: error }));
        },
      );
    });
  }
}
