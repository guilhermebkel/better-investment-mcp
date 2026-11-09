import type { ClosedMetric, FiiColumn, SourceGroup } from "@/Protocols/MetricCatalogProtocol.ts";

const CLOSED_METRICS: readonly ClosedMetric[] = [
  "fund.quota", "fund.net_worth", "fund.total_value", "fund.subscriptions", "fund.redemptions", "fund.holders",
  "macro.value",
  "treasury.buy_rate", "treasury.sell_rate", "treasury.buy_unit_price", "treasury.sell_unit_price", "treasury.base_unit_price",
  "fx.buy_rate", "fx.sell_rate",
];

const FII_COLUMNS: readonly FiiColumn[] = [
  "net_worth", "liquidity_requirement", "cash_available", "government_bonds", "corporate_bonds", "fixed_income_funds",
  "distributable_income", "rental_revenue", "property_sales_revenue", "other_revenue", "total_revenue",
  "management_fee", "performance_fee", "property_acquisitions", "other_expenses", "total_expenses",
];

const SOURCE_NAMED = "named by the source (for example fundamental.roe or statement.dre_con.3_01)";
const FII_NAMES = FII_COLUMNS.map((column) => `fii.${column}`).join(", ");

const GROUP_TO_DESCRIPTION: Readonly<Record<SourceGroup, string>> = {
  fii: `the fii metrics are ${FII_NAMES}`,
  fundamental: `the fundamental metrics are ${SOURCE_NAMED}`,
  statement: `the statement metrics are ${SOURCE_NAMED}`,
};

const SOURCE_GROUPS: readonly SourceGroup[] = ["fii", "fundamental", "statement"];

export class MetricCatalogService {
  static isKnown(metric: string): boolean {
    // Why: the fund, macro, treasury and currency names are closed; the fundamental and statement names come from the source, so only their group is checked.
    if (CLOSED_METRICS.some((name) => name === metric)) {
      return true;
    }
    if (metric.startsWith("fii.")) {
      const column = metric.slice("fii.".length);
      return FII_COLUMNS.some((known) => known === column);
    }
    if (metric.startsWith("fundamental.")) {
      return metric.length > "fundamental.".length;
    }
    return /^statement\.[^.]+\.[^.]+$/u.test(metric);
  }

  static describeGroup(metric: string): string {
    const group = metric.split(".")[0] ?? "";
    const sourceGroup = SOURCE_GROUPS.find((name) => name === group);
    if (sourceGroup !== undefined) {
      return GROUP_TO_DESCRIPTION[sourceGroup];
    }
    const known = CLOSED_METRICS.filter((name) => name.startsWith(`${group}.`));
    return known.length === 0 ? "no metric of this group is known" : `the ${group} metrics are ${known.join(", ")}`;
  }

  static readonly CLOSED_METRICS: readonly ClosedMetric[] = CLOSED_METRICS;
  static readonly FII_COLUMNS: readonly FiiColumn[] = FII_COLUMNS;
}
