import type { GetOverviewInput, OverviewDependencies } from "@/Protocols/GetOverviewProtocol.ts";
import type { OperationPort, OperationResult } from "@/Protocols/OperationProtocol.ts";
import { GetOverviewInputSchema } from "@/Schemas/GetOverviewSchema.ts";
import { GUIDE_TOPICS } from "@/Schemas/GetGuideSchema.ts";

export class GetOverviewOperation implements OperationPort<GetOverviewInput> {
  static readonly NAME = "getOverview";
  static readonly USAGE_NOTICE = "Usage notice: the output describes and locates information. It is not investment advice, a recommendation or an analysis of what to buy or sell.";
  static readonly FILTER_RULE = "Filter rule: every data table needs WHERE filters that compare with = or IN and literal values. A query without them is refused, and the answer names the filter to add.";
  static readonly TABLE_LINES = GetOverviewOperation.buildTableLines();

  readonly name = GetOverviewOperation.NAME;
  readonly description = "Read-only. Describes the server and its usage notice. Call it first to see what the server does. It takes no input and returns a short text.";
  readonly inputSchema = GetOverviewInputSchema;

  private readonly dependencies: OverviewDependencies;

  constructor(dependencies: OverviewDependencies) {
    this.dependencies = dependencies;
  }

  async execute(): Promise<OperationResult> {
    const loaded = await this.readLoadedLines();
    const message = [
      "Better Investment Analysis: data on Brazilian assets, read with query_sql.",
      "Tools: get_overview, get_guide and query_sql. All three only read.",
      "Markets and asset types: BR stocks, FIIs and ETFs (Yahoo prices and dividends, CVM filings, BCB macro series). US assets are planned.",
      "Tables:",
      ...GetOverviewOperation.TABLE_LINES.map((line) => `- ${line}`),
      GetOverviewOperation.FILTER_RULE,
      `Guide topics for get_guide: ${GUIDE_TOPICS.join(", ")}.`,
      "Loaded now (asset_coverage):",
      ...loaded,
      `Cache: one DuckDB file in the directory set by INVESTMENT_MCP_CACHE_DIR, or the system temporary directory. Each load is valid for ${this.dependencies.cacheTtlSeconds} seconds.`,
      GetOverviewOperation.USAGE_NOTICE,
    ].join("\n");
    return { isError: false, message };
  }

  private static buildTableLines(): string[] {
    return [
      "assets: one row per asset, with its name, currency and legal id when known. No filter.",
      "quotes: daily prices, adj_close, volume and the is_stale and suspect_tick flags. Filter: market, ticker, asset_type.",
      "splits: stock splits with the ratio. Filter: market, ticker, asset_type.",
      "dividends: cash distributions by ex_date and kind. Filter: market, ticker, asset_type.",
      "fundamentals: yearly metrics by metric name. Filter: market, ticker, asset_type.",
      "fii_monthly: FII monthly revenue, expenses, cash and distributions. Filter: market, ticker, asset_type.",
      "filings: the filings of a company with type, date and url. Filter: market, ticker, asset_type.",
      "chunks: the text of filings by section and page. Filter: market, ticker, asset_type and filing_type or filing_id.",
      "macro_series: monthly and daily macro series (ipca, cdi, selic, ptax, igpm). Filter: series.",
      "asset_coverage, cache_runs: what is loaded, and the load runs. No filter.",
    ];
  }

  private async readLoadedLines(): Promise<string[]> {
    try {
      const rows = await this.dependencies.readLoaded();
      if (rows.length === 0) {
        return ["- nothing yet; the first query for an asset loads it."];
      }
      return rows.map((row) => `- ${String(row.market)}:${String(row.ticker)} ${String(row.asset_type)} ${String(row.category)} from ${String(row.source)}, valid until ${String(row.expires_at)}`);
    } catch {
      return ["- the loaded list cannot be read now; try query_sql with asset_coverage."];
    }
  }
}
