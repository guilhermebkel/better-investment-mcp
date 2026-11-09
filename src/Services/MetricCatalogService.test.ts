import { describe, expect, it } from "vitest";
import { ASSET_LIABILITY_COLUMNS, COMPLEMENT_COLUMNS } from "@/Adapters/Cvm/CvmFundMonthlyAdapter.ts";
import { StatusInvestAdapter } from "@/Adapters/StatusInvest/StatusInvestAdapter.ts";
import { MetricCatalogService } from "@/Services/MetricCatalogService.ts";

describe("MetricCatalogService.isKnown()", () => {
  it("knows the closed names of the fund, macro, treasury and currency groups", () => {
    expect(MetricCatalogService.isKnown("fund.quota")).toBe(true);
    expect(MetricCatalogService.isKnown("macro.value")).toBe(true);
    expect(MetricCatalogService.isKnown("treasury.buy_rate")).toBe(true);
    expect(MetricCatalogService.isKnown("fx.sell_rate")).toBe(true);
  });

  it("refuses a name that is not in a closed group, and an FII column that does not exist", () => {
    expect(MetricCatalogService.isKnown("fii.dividend_yield")).toBe(false);
    expect(MetricCatalogService.isKnown("fx.ptax")).toBe(false);
    expect(MetricCatalogService.isKnown("macro.selic")).toBe(false);
  });

  it("accepts any fundamental and any statement code, which the source names", () => {
    expect(MetricCatalogService.isKnown("fundamental.roe")).toBe(true);
    expect(MetricCatalogService.isKnown("statement.dre_con.3_01")).toBe(true);
    expect(MetricCatalogService.isKnown("statement.dre_con")).toBe(false);
  });

  it("knows exactly the FII columns the CVM and StatusInvest adapters write", () => {
    const fromCvm = [...COMPLEMENT_COLUMNS, ...ASSET_LIABILITY_COLUMNS].map(([, field]) => field);
    const fromStatusInvest = [
      ...Object.values(StatusInvestAdapter.RENT_FIELD_TO_COLUMN),
      ...Object.values(StatusInvestAdapter.EXPENSE_FIELD_TO_COLUMN),
      ...Object.values(StatusInvestAdapter.CASH_FIELD_TO_COLUMN),
      ...Object.values(StatusInvestAdapter.NET_WORTH_FIELD_TO_COLUMN),
    ];
    const adapterColumns = [...new Set([...fromCvm, ...fromStatusInvest])].sort();
    expect(adapterColumns).toStrictEqual([...MetricCatalogService.FII_COLUMNS].sort());
  });
});
