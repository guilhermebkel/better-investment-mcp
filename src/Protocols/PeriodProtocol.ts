export type PeriodWindow = {
  from: string;
  to: string;
};

export type PeriodBounds = {
  from?: string;
  to?: string;
};

export type PeriodSide = "from" | "to";

export type PeriodConstraint = {
  qualifier?: string;
  column: string;
  side: PeriodSide;
  date: string;
};

export type ComparisonSides = {
  whenColumnLeft: readonly PeriodSide[];
  whenColumnRight: readonly PeriodSide[];
};

export type PeriodComparisonType
  = "COMPARE_EQUAL"
    | "COMPARE_GREATERTHANOREQUALTO"
    | "COMPARE_GREATERTHAN"
    | "COMPARE_LESSTHANOREQUALTO"
    | "COMPARE_LESSTHAN";

export type PeriodNodeType
  = "CONJUNCTION_AND"
    | "COMPARE_BETWEEN"
    | "COMPARE_IN"
    | PeriodComparisonType;

export type PeriodReader = (node: unknown, children: unknown[]) => PeriodConstraint[];
