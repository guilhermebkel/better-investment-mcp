export type SourceGroup = "fii" | "fundamental" | "statement";

export type ClosedMetric
  = "fund.quota" | "fund.net_worth" | "fund.total_value" | "fund.subscriptions" | "fund.redemptions" | "fund.holders"
    | "macro.value"
    | "treasury.buy_rate" | "treasury.sell_rate" | "treasury.buy_unit_price" | "treasury.sell_unit_price" | "treasury.base_unit_price"
    | "fx.buy_rate" | "fx.sell_rate";

export type FiiColumn
  = "net_worth" | "liquidity_requirement" | "cash_available" | "government_bonds" | "corporate_bonds" | "fixed_income_funds"
    | "distributable_income" | "rental_revenue" | "property_sales_revenue" | "other_revenue" | "total_revenue"
    | "management_fee" | "performance_fee" | "property_acquisitions" | "other_expenses" | "total_expenses";
