import { describe, expect, it } from "vitest";
import { PeriodService } from "@/Services/PeriodService.ts";

const CURRENT_YEAR = 2026;
const FIRST_DAY_2024 = "2024-01-01";
const LAST_DAY_2024 = "2024-12-31";
const FIRST_DAY_2025 = "2025-01-01";
const LAST_DAY_2026 = "2026-12-31";
const FIRST_DAY_2023 = "2023-01-01";
const CROSS_FROM = "2023-06-01";
const CROSS_TO = "2024-03-31";

describe("PeriodService.resolve()", () => {
  it("gives the last three years when the query states no period", () => {
    expect(PeriodService.resolve(undefined, CURRENT_YEAR)).toStrictEqual({ from: FIRST_DAY_2024, to: LAST_DAY_2026 });
  });

  it("runs from a stated start to the end of the current year", () => {
    expect(PeriodService.resolve({ from: "2019-06-01" }, CURRENT_YEAR)).toStrictEqual({ from: "2019-06-01", to: LAST_DAY_2026 });
  });

  it("starts at the beginning of the year of a stated end that is before the default start", () => {
    expect(PeriodService.resolve({ to: "2019-06-30" }, CURRENT_YEAR)).toStrictEqual({ from: "2019-01-01", to: "2019-06-30" });
  });

  it("keeps both stated bounds as they are", () => {
    const window = { from: CROSS_FROM, to: CROSS_TO };
    expect(PeriodService.resolve(window, CURRENT_YEAR)).toStrictEqual(window);
  });

  it("does not cut a period that starts in a later year than the current one", () => {
    expect(PeriodService.resolve({ from: "2030-02-01" }, CURRENT_YEAR)).toStrictEqual({ from: "2030-02-01", to: "2030-12-31" });
  });
});

describe("PeriodService.readYears()", () => {
  it("gives one year for a window inside a year", () => {
    expect(PeriodService.readYears({ from: "2025-02-01", to: "2025-11-30" })).toStrictEqual([2025]);
  });

  it("gives both years of a window that crosses a year boundary (AC4)", () => {
    expect(PeriodService.readYears({ from: CROSS_FROM, to: CROSS_TO })).toStrictEqual([2023, 2024]);
  });

  it("gives no year for a window that is empty", () => {
    expect(PeriodService.readYears({ from: FIRST_DAY_2025, to: FIRST_DAY_2023 })).toStrictEqual([]);
  });
});

describe("PeriodService.isWithin()", () => {
  const window = { from: FIRST_DAY_2024, to: LAST_DAY_2024 };

  it("includes both ends of the window", () => {
    expect(PeriodService.isWithin(window, FIRST_DAY_2024)).toBe(true);
    expect(PeriodService.isWithin(window, LAST_DAY_2024)).toBe(true);
  });

  it("leaves out a date just before or just after the window", () => {
    expect(PeriodService.isWithin(window, "2023-12-31")).toBe(false);
    expect(PeriodService.isWithin(window, FIRST_DAY_2025)).toBe(false);
  });
});

describe("PeriodService.isDate()", () => {
  it.each([
    ["2024-03-31", true],
    ["2024-3-31", false],
    ["2024-13-01", false],
    ["31/03/2024", false],
  ])("reads %s as a date: %s", (text, expected) => {
    expect(PeriodService.isDate(text)).toBe(expected);
  });
});

describe("PeriodService.isEmpty()", () => {
  it("is true when the window starts after it ends", () => {
    expect(PeriodService.isEmpty({ from: "2025-01-01", to: LAST_DAY_2024 })).toBe(true);
    expect(PeriodService.isEmpty({ from: LAST_DAY_2024, to: LAST_DAY_2024 })).toBe(false);
  });
});
