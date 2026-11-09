import type { GetOverviewInput, OverviewDependencies } from "@/Protocols/GetOverviewProtocol.ts";
import type { OperationPort, OperationResult } from "@/Protocols/OperationProtocol.ts";
import { GetOverviewInputSchema } from "@/Schemas/GetOverviewSchema.ts";
import { GUIDE_TOPICS } from "@/Schemas/GetGuideSchema.ts";

export class GetOverviewOperation implements OperationPort<GetOverviewInput> {
  static readonly NAME = "getOverview";
  static readonly USAGE_NOTICE = "Usage notice: the output describes and locates information. It is not investment advice, a recommendation or an analysis of what to buy or sell.";
  static readonly FILTER_RULE = "Filter rule: every asset table needs WHERE asset_id = or IN with literal values (market:asset_type:code, for example BR:stock:PETR4); asset_metrics also needs metric; a query without them is refused, and the answer names the filter to add.";
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
      "Better Investment: data on Brazilian assets, read with query_sql.",
      "Tools: get_overview, get_guide and query_sql. All three only read.",
      "Markets and asset types: BR stocks, FIIs, funds, indexes and currencies, and Tesouro bonds. US assets are planned.",
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
      "asset: one row per asset (asset_id, market, asset_type, code, name, legal_id, isin, sector, currency). Filter: asset_id.",
      "asset_quotes: daily prices with adj_close, volume and the is_stale and suspect_tick flags. Filter: asset_id.",
      "asset_splits and asset_dividends: stock splits with the ratio, and cash distributions by ex_time and kind. Filter: asset_id.",
      "asset_metrics: every number in long format (metric, value, unit): fundamental.*, statement.*, fii.*, fund.*, macro.value, treasury.*, fx.*. Filter: asset_id and metric.",
      "asset_expectations: BCB Focus annual expectations by survey_time (mean, median, min, max). Filter: asset_id.",
      "asset_filings and asset_filing_items: filings and disclosure documents (FRE, VLMO, CGVN) by document_type, with their rows. Filter: asset_id.",
      "asset_filing_chunks: the text of filings by section and page. Filter: asset_id and document_type or filing_id.",
      "asset_holdings and asset_attribute: fund holdings by block, and fund administrator, manager and type. Filter: asset_id.",
      "asset_coverage, load_runs, load_files: what is loaded, when it expires, and the load runs and file versions. No filter.",
    ];
  }

  private async readLoadedLines(): Promise<string[]> {
    try {
      const rows = await this.dependencies.readLoaded();
      if (rows.length === 0) {
        return ["- nothing yet; the first query for an asset loads it."];
      }
      return rows.map((row) => `- ${String(row.asset_id)} ${String(row.category)}, ${String(row.first_date)} to ${String(row.last_date)}, valid until ${String(row.expires_at)}`);
    } catch {
      return ["- the loaded list cannot be read now; try query_sql with asset_coverage."];
    }
  }
}
