import type { PeriodBounds, PeriodWindow } from "@/Protocols/PeriodProtocol.ts";
import type { DataTable } from "@/Protocols/SqlGuardProtocol.ts";

const YEARS_BACK_BY_DEFAULT = 2;
const MAX_YEARS_PER_LOAD = 10;
const YEAR_END_SUFFIX = "-12-31";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const YEAR_LENGTH = 4;

export class PeriodService {
  // Why: a table with a reference period, and the column that holds it (`issue #28`, S3).
  static readonly TABLE_TO_PERIOD_COLUMN: Partial<Record<DataTable, string>> = {
    financial_statements: "period_end",
    fii_monthly: "period",
    filings: "reference_date",
  };

  // Why: what a reader sees in a table with no row for a month, so an empty month is not read as missing data.
  static readonly TABLE_TO_PERIODICITY: Partial<Record<DataTable, string>> = {
    financial_statements: "quarterly (ITR: three months and year to date) and yearly (DFP); a month has no value of its own",
    fii_monthly: "monthly: one row per reference month, dated the first day of the month",
    filings: "one row per filing; reference_date is the period the document refers to, delivered_at is when it was filed",
  };

  // Why: a single query loads at most this many years of files, because each yearly CVM zip is tens of megabytes; a longer period is refused with the reason.
  static readonly MAX_YEARS_PER_LOAD = MAX_YEARS_PER_LOAD;

  static isDate(text: string): boolean {
    return DATE_PATTERN.test(text) && !Number.isNaN(Date.parse(text));
  }

  static readYear(date: string): number {
    return Number(date.slice(0, YEAR_LENGTH));
  }

  static resolve(bounds: PeriodBounds | undefined, currentYear: number): PeriodWindow {
    const defaultFromYear = currentYear - YEARS_BACK_BY_DEFAULT;
    const toYear = bounds?.to === undefined ? undefined : PeriodService.readYear(bounds.to);
    const fromYear = bounds?.from === undefined ? undefined : PeriodService.readYear(bounds.from);
    // Why: a missing lower bound reaches back to the earlier of the default start and the upper bound, so a query for one old year loads that year.
    const fromFallbackYear = toYear === undefined ? defaultFromYear : Math.min(defaultFromYear, toYear);
    // Why: a missing upper bound runs to the later of the current year and the lower bound, so a query from a future year is not cut.
    const toFallbackYear = fromYear === undefined ? currentYear : Math.max(currentYear, fromYear);
    return {
      from: bounds?.from ?? PeriodService.startOfYear(fromFallbackYear),
      to: bounds?.to ?? PeriodService.endOfYear(toFallbackYear),
    };
  }

  static buildDefaultWindow(currentYear: number): PeriodWindow {
    return PeriodService.resolve(undefined, currentYear);
  }

  static readYears(window: PeriodWindow): number[] {
    const first = PeriodService.readYear(window.from);
    const last = PeriodService.readYear(window.to);
    return Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => first + index);
  }

  static isDateInWindow(window: PeriodWindow | undefined, date: string): boolean {
    if (window === undefined) {
      return true;
    }
    return PeriodService.isDate(date) && PeriodService.isWithin(window, date);
  }

  static isWithin(window: PeriodWindow, date: string): boolean {
    return date >= window.from && date <= window.to;
  }

  static isEmpty(window: PeriodWindow): boolean {
    return window.from > window.to;
  }

  private static startOfYear(year: number): string {
    return `${year}-01-01`;
  }

  private static endOfYear(year: number): string {
    return `${year}${YEAR_END_SUFFIX}`;
  }
}
