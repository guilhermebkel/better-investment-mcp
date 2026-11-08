import type { CacheCategory } from "@/Protocols/CacheProtocol.ts";
import type { DatabasePort } from "@/Protocols/DatabaseProtocol.ts";
import type {
  ColumnRef,
  ConditionReader,
  ConditionType,
  Constraint,
  DataTable,
  FromReading,
  GuardVerdict,
  SelectCheck,
  SqlGuardPort,
  TableFilters,
  TableRef,
} from "@/Protocols/SqlGuardProtocol.ts";
import {
  BaseTableSchema,
  ColumnRefSchema,
  EqualityNodeSchema,
  JoinSchema,
  ParsedSqlSchema,
  StringConstantSchema,
  TableFunctionSchema,
} from "@/Schemas/SqlGuardSchema.ts";

const SELECT_TYPES: readonly ("SELECT_NODE" | "SET_OPERATION_NODE")[] = ["SELECT_NODE", "SET_OPERATION_NODE"];

const isSelectType = (value: string): boolean => SELECT_TYPES.some((candidate) => candidate === value);
const SERIES_MARKET = "SERIES";
const QUALIFIED_COLUMN_PARTS = 2;

export class SqlGuardService implements SqlGuardPort {
  static readonly TABLE_TO_CATEGORY: Record<DataTable, CacheCategory> = {
    quotes: "quotes",
    splits: "quotes",
    dividends: "dividends",
    fundamentals: "fundamentals",
    financial_statements: "statements",
    fii_monthly: "fund_data",
    filings: "filings",
    chunks: "documents",
    macro_series: "macro",
  };

  static readonly MARKET_FILTERS: TableFilters = { columns: ["market", "ticker", "asset_type"], anyOf: [] };
  static readonly TABLE_TO_FILTERS: Record<DataTable, TableFilters> = {
    quotes: SqlGuardService.MARKET_FILTERS,
    splits: SqlGuardService.MARKET_FILTERS,
    dividends: SqlGuardService.MARKET_FILTERS,
    fundamentals: SqlGuardService.MARKET_FILTERS,
    financial_statements: SqlGuardService.MARKET_FILTERS,
    fii_monthly: SqlGuardService.MARKET_FILTERS,
    filings: SqlGuardService.MARKET_FILTERS,
    chunks: { columns: ["market", "ticker", "asset_type"], anyOf: ["filing_type", "filing_id"] },
    macro_series: { columns: ["series"], anyOf: [] },
  };

  static readonly CONDITION_TO_READER = new Map<ConditionType, ConditionReader>([
    ["CONJUNCTION_AND", (_node, children) => SqlGuardService.readAndConstraints(children)],
    ["CONJUNCTION_OR", (_node, children) => SqlGuardService.readOrConstraints(children)],
    ["COMPARE_EQUAL", (node) => SqlGuardService.readEqualityOf(node)],
    ["COMPARE_IN", (_node, children) => SqlGuardService.readInList(children)],
  ]);

  static readonly MAX_ASSETS = 50;

  private readonly parser: DatabasePort;

  constructor(parser: DatabasePort) {
    this.parser = parser;
  }

  async checkSql(sql: string): Promise<GuardVerdict> {
    // Why: json_serialize_sql accepts a single SELECT only, so PRAGMA, COPY, ATTACH, INSTALL, LOAD and every change of data stop here.
    const rows = await this.parser.readRows("SELECT json_serialize_sql(?) AS ast", [sql]);
    const astText = String(rows[0]?.ast);
    const parsed = ParsedSqlSchema.parse(JSON.parse(astText));
    if (parsed.error) {
      const message = SqlGuardService.describeParserError(parsed.error_type, parsed.error_message);
      return { isAccepted: false, message };
    }
    const statements = parsed.statements ?? [];
    if (statements.length !== 1) {
      return { isAccepted: false, message: "Send exactly one SELECT statement per query." };
    }
    const selects = statements.flatMap((statement) => SqlGuardService.collectSelects(statement.node));
    const cteNames = selects.flatMap((select) => SqlGuardService.readCteNames(select));
    const cteProblems = cteNames
      .filter((name) => SqlGuardService.isDataTable(name))
      .map((name) => `A WITH name cannot be the name of a data table: rename ${name}.`);
    const checks = selects.map((select) => SqlGuardService.checkSelect(select, cteNames));
    const problems = [...cteProblems, ...checks.flatMap((check) => check.problems)];
    if (problems.length > 0) {
      return { isAccepted: false, message: problems.join("\n") };
    }
    const requirements = checks.flatMap((check) => check.requirements);
    if (requirements.length > SqlGuardService.MAX_ASSETS) {
      const message = `One query can load at most ${SqlGuardService.MAX_ASSETS} assets; this one asks for ${requirements.length}. Filter fewer tickers.`;
      return { isAccepted: false, message };
    }
    return { isAccepted: true, requirements };
  }

  static isDataTable(name: string): name is DataTable {
    return Object.hasOwn(SqlGuardService.TABLE_TO_CATEGORY, name);
  }

  private static describeParserError(errorType: string | undefined, message: string | undefined): string {
    if (errorType === "not implemented") {
      return "Only a SELECT statement runs. PRAGMA, COPY, ATTACH, INSTALL, LOAD and every statement that changes data are refused.";
    }
    return `The query has a syntax error: ${message ?? "unknown error"}`;
  }

  private static collectSelects(node: unknown): unknown[] {
    const found: unknown[] = [];
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (typeof value !== "object" || value === null) {
        return;
      }
      const type: unknown = Reflect.get(value, "type");
      if (typeof type === "string" && isSelectType(type)) {
        found.push(value);
      }
      Object.values(value).forEach(visit);
    };
    visit(node);
    return found;
  }

  private static readCteNames(select: unknown): string[] {
    const cteMap = Reflect.get(select as object, "cte_map") as { map?: { key: string }[] } | undefined;
    return (cteMap?.map ?? []).map((entry) => entry.key.toLowerCase());
  }

  private static checkSelect(select: unknown, cteNames: readonly string[]): SelectCheck {
    if (Reflect.get(select as object, "type") === "SET_OPERATION_NODE") {
      return { problems: [], requirements: [] };
    }
    const from = SqlGuardService.readFrom(select);
    const documentRefs = from.refs.filter((ref) => ref.table === "document_text");
    const documentProblems = documentRefs.map(() => "document_text has no market, ticker or asset_type column. "
      + "Query chunks instead, with its filters and filing_type or filing_id.");
    const whereClause: unknown = Reflect.get(select as object, "where_clause");
    const conditions = [whereClause, ...from.joinConditions];
    const constraints = conditions.flatMap((condition) => SqlGuardService.readConstraints(condition));
    const dataRefs = from.refs.filter((ref) => {
      return !cteNames.includes(ref.name.toLowerCase()) && SqlGuardService.isDataTable(ref.table);
    });
    const checks = dataRefs.map((ref) => SqlGuardService.checkRef(ref, dataRefs.length === 1, constraints));
    return {
      problems: [...from.problems, ...documentProblems, ...checks.flatMap((check) => check.problems)],
      requirements: checks.flatMap((check) => check.requirements),
    };
  }

  private static readFrom(select: unknown): FromReading {
    const refs: TableRef[] = [];
    const joinConditions: unknown[] = [];
    const problems: string[] = [];
    const visit = (node: unknown): void => {
      const base = BaseTableSchema.safeParse(node);
      if (base.success) {
        const table = base.data.table_name.toLowerCase();
        // Why: DuckDB reports an unaliased table with an empty alias, so the table name stands in for it.
        const alias = base.data.alias ?? "";
        refs.push({ table, name: alias === "" ? table : alias });
        return;
      }
      const join = JoinSchema.safeParse(node);
      if (join.success) {
        joinConditions.push(join.data.condition);
        visit(join.data.left);
        visit(join.data.right);
        return;
      }
      const tableFunction = TableFunctionSchema.safeParse(node);
      if (tableFunction.success) {
        problems.push(`${tableFunction.data.function.function_name}(...) is not available in query_sql yet. `
          + "Read the table it reads instead, with its filters.");
      }
    };
    visit(Reflect.get(select as object, "from_table"));
    return { refs, joinConditions, problems };
  }

  private static checkRef(ref: TableRef, isSingleRef: boolean, constraints: Constraint[]): SelectCheck {
    const table = ref.table as DataTable;
    const alias = ref.name.toLowerCase();
    const filters = SqlGuardService.TABLE_TO_FILTERS[table];
    const readValues = (column: string): string[] | undefined => {
      return SqlGuardService.readValues(constraints, column, alias, isSingleRef);
    };
    const missing = filters.columns.filter((column) => readValues(column) === undefined);
    const hasAnyOf = filters.anyOf.length === 0 || filters.anyOf.some((column) => readValues(column) !== undefined);
    if (missing.length > 0 || !hasAnyOf) {
      const needed = [...missing, ...(hasAnyOf ? [] : [filters.anyOf.join(" or ")])];
      return { problems: [SqlGuardService.describeMissing(ref, needed)], requirements: [] };
    }
    const category = SqlGuardService.TABLE_TO_CATEGORY[table];
    if (table === "macro_series") {
      const series = readValues("series") ?? [];
      const requirements = series.map((value) => ({ table, category, market: SERIES_MARKET, ticker: value }));
      return { problems: [], requirements };
    }
    const market = readValues("market") ?? [];
    const ticker = readValues("ticker") ?? [];
    const assetType = readValues("asset_type") ?? [];
    const requirements = market.flatMap((marketValue) => ticker.flatMap((tickerValue) => assetType.map((typeValue) => ({
      table,
      category,
      market: marketValue,
      ticker: tickerValue,
      assetType: typeValue,
    }))));
    return { problems: [], requirements };
  }

  private static readValues(
    constraints: readonly Constraint[],
    column: string,
    alias: string,
    isSingleRef: boolean,
  ): string[] | undefined {
    const matching = constraints.filter((constraint) => {
      const isForThisRef = constraint.qualifier === undefined ? isSingleRef : constraint.qualifier === alias;
      return isForThisRef && constraint.column === column;
    });
    const [first] = matching;
    if (first === undefined) {
      return undefined;
    }
    return matching.reduce<string[]>((kept, constraint) => {
      return kept.filter((value) => constraint.values.includes(value));
    }, first.values);
  }

  private static describeMissing(ref: TableRef, missing: string[]): string {
    const label = ref.name === ref.table ? ref.table : `${ref.table} (as ${ref.name})`;
    return `${label} needs a WHERE filter on ${missing.join(", ")}, compared with = or IN and literal values. `
      + "Example: WHERE market = 'BR' AND ticker = 'PETR4' AND asset_type = 'stock'. "
      + "A filter that is a function, a subquery or one branch of an OR is not read as a filter.";
  }

  private static readConstraints(node: unknown): Constraint[] {
    if (typeof node !== "object" || node === null) {
      return [];
    }
    const type: unknown = Reflect.get(node, "type");
    const children: unknown = Reflect.get(node, "children");
    const reader = SqlGuardService.findConditionReader(type);
    if (reader === undefined) {
      return [];
    }
    return reader(node, Array.isArray(children) ? children : []);
  }

  private static findConditionReader(type: unknown): ConditionReader | undefined {
    return SqlGuardService.CONDITION_TO_READER.get(type as ConditionType);
  }

  private static readAndConstraints(children: unknown[]): Constraint[] {
    return children.flatMap((child) => SqlGuardService.readConstraints(child));
  }

  private static readEqualityOf(node: unknown): Constraint[] {
    const equality = EqualityNodeSchema.safeParse(node);
    if (!equality.success) {
      return [];
    }
    const { left, right } = equality.data;
    return SqlGuardService.readEquality(left, right) ?? SqlGuardService.readEquality(right, left) ?? [];
  }

  private static readEquality(subject: unknown, value: unknown): Constraint[] | undefined {
    const column = SqlGuardService.readColumn(subject);
    const literal = StringConstantSchema.safeParse(value);
    if (column === undefined || !literal.success) {
      return undefined;
    }
    return [{ ...column, values: [literal.data.literal.text] }];
  }

  private static readInList(children: unknown[]): Constraint[] {
    const [subject, ...values] = children;
    const column = SqlGuardService.readColumn(subject);
    if (column === undefined) {
      return [];
    }
    const texts: string[] = [];
    for (const value of values) {
      const literal = StringConstantSchema.safeParse(value);
      if (!literal.success) {
        return [];
      }
      texts.push(literal.data.literal.text);
    }
    return texts.length === 0 ? [] : [{ ...column, values: texts }];
  }

  private static readColumn(node: unknown): ColumnRef | undefined {
    const parsed = ColumnRefSchema.safeParse(node);
    if (!parsed.success) {
      return undefined;
    }
    const names = parsed.data.column_names.map((name) => name.toLowerCase());
    const [first = "", second] = names;
    if (names.length === 1) {
      return { column: first };
    }
    if (names.length === QUALIFIED_COLUMN_PARTS && second !== undefined) {
      return { qualifier: first, column: second };
    }
    return undefined;
  }

  private static readOrConstraints(branches: unknown[]): Constraint[] {
    // Why: an OR filters a column only when every branch filters it, so a branch that does not filter it is never read as a filter.
    const [first = [], ...others] = branches.map((branch) => SqlGuardService.readConstraints(branch));
    return first.flatMap((constraint) => {
      const counterparts = others.map((other) => other.find((candidate) => {
        return candidate.column === constraint.column && candidate.qualifier === constraint.qualifier;
      }));
      if (counterparts.some((counterpart) => counterpart === undefined)) {
        return [];
      }
      const present = counterparts.flatMap((counterpart) => (counterpart === undefined ? [] : [counterpart]));
      const values = [constraint, ...present].flatMap((entry) => entry.values);
      return [{ qualifier: constraint.qualifier, column: constraint.column, values: [...new Set(values)] }];
    });
  }
}
