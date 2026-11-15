import type { CacheCategory } from "@/Protocols/CacheProtocol.ts";
import type { DatabasePort } from "@/Protocols/DatabaseProtocol.ts";
import type { ComparisonSides, PeriodBounds, PeriodConstraint, PeriodNodeType, PeriodReader } from "@/Protocols/PeriodProtocol.ts";
import type {
  NodeShape,
  ColumnRef,
  ConditionReader,
  ConditionType,
  Constraint,
  DataTable,
  FilingSelector,
  FromReading,
  GuardVerdict,
  MacroReading,
  RefScope,
  Requirement,
  SelectCheck,
  SqlGuardPort,
  TableFilters,
  TableRef,
} from "@/Protocols/SqlGuardProtocol.ts";
import {
  BaseTableSchema,
  BetweenNodeSchema,
  ColumnRefSchema,
  ConstantExpressionSchema,
  EqualityNodeSchema,
  JoinSchema,
  OperatorCastSchema,
  ParsedSqlSchema,
  StringConstantSchema,
  TableFunctionSchema,
} from "@/Schemas/SqlGuardSchema.ts";
import { PeriodService } from "@/Services/PeriodService.ts";
import { AssetIdUtil } from "@/Utils/AssetIdUtil.ts";
import { DisclosureTypeUtil } from "@/Utils/DisclosureTypeUtil.ts";
import type { AssetReading, CategoryReader, CategoryReading, MetricGroup, SearchMode } from "@/Protocols/SqlGuardProtocol.ts";
import type { AssetIdParts } from "@/Protocols/AssetIdProtocol.ts";

const SELECT_TYPES: readonly ("SELECT_NODE" | "SET_OPERATION_NODE")[] = ["SELECT_NODE", "SET_OPERATION_NODE"];

const isSelectType = (value: string): boolean => SELECT_TYPES.some((candidate) => candidate === value);
const QUALIFIED_COLUMN_PARTS = 2;
const SEARCH_MACRO = "search_chunks";
const SEARCH_MACRO_FILTERS = ["asset_id", "document_type", "section"] as const;
// Why: the modes are listed here so a mode not built yet is refused by name, before any query runs.
const SEARCH_MACRO_MODES: readonly SearchMode[] = ["text"];
// Why: the query text and the mode are the two arguments that are not filters.
const SEARCH_MACRO_NON_FILTER_ARGUMENTS = 2;
const SEARCH_MACRO_ARGUMENT_COUNT = SEARCH_MACRO_FILTERS.length + SEARCH_MACRO_NON_FILTER_ARGUMENTS;

export class SqlGuardService implements SqlGuardPort {
  static readonly TABLE_TO_CATEGORY: Partial<Record<DataTable, CacheCategory>> = {
    asset: "registry",
    asset_attribute: "registry",
    asset_quotes: "quotes",
    asset_dividends: "dividends",
    asset_splits: "quotes",
    asset_expectations: "expectations",
    asset_holdings: "fund",
    asset_filings: "filings",
    asset_filing_items: "disclosures",
    asset_proceedings: "proceedings",
    asset_complaints: "complaints",
    asset_news: "news",
    asset_filing_chunks: "documents",
  };

  // Why: a table whose category depends on its filters or its metrics has a reader of its own; the other tables have one fixed category.
  static readonly TABLE_TO_CATEGORY_READER: Partial<Record<DataTable, CategoryReader>> = {
    asset_filings: (readValues) => SqlGuardService.readFilingCategories(readValues),
    asset_metrics: (readValues) => SqlGuardService.readMetricCategories(readValues),
  };

  // Why: asset_metrics holds the numbers of several categories; the first word of the metric name says which category fills it.
  static readonly METRIC_GROUP_TO_CATEGORY: Readonly<Record<MetricGroup, CacheCategory>> = {
    statement: "statements",
    fundamental: "fundamentals",
    fii: "fund_data",
    fund: "fund",
    macro: "macro",
    treasury: "treasury",
    fx: "fx",
    sector: "sector",
    index: "index_membership",
    banking: "banking",
  };

  static readonly ASSET_FILTERS: TableFilters = { columns: ["asset_id"], anyOf: [] };
  static readonly TABLE_TO_FILTERS: Record<DataTable, TableFilters> = {
    asset: SqlGuardService.ASSET_FILTERS,
    asset_attribute: SqlGuardService.ASSET_FILTERS,
    asset_proceedings: SqlGuardService.ASSET_FILTERS,
    asset_complaints: SqlGuardService.ASSET_FILTERS,
    asset_news: SqlGuardService.ASSET_FILTERS,
    asset_quotes: SqlGuardService.ASSET_FILTERS,
    asset_dividends: SqlGuardService.ASSET_FILTERS,
    asset_splits: SqlGuardService.ASSET_FILTERS,
    asset_metrics: { columns: ["asset_id", "metric"], anyOf: [] },
    asset_expectations: SqlGuardService.ASSET_FILTERS,
    asset_holdings: SqlGuardService.ASSET_FILTERS,
    asset_filings: SqlGuardService.ASSET_FILTERS,
    asset_filing_items: SqlGuardService.ASSET_FILTERS,
    asset_filing_chunks: { columns: ["asset_id"], anyOf: ["document_type", "filing_id"] },
  };

  static readonly CONDITION_TO_READER = new Map<ConditionType, ConditionReader>([
    ["CONJUNCTION_AND", (_node, children) => SqlGuardService.readAndConstraints(children)],
    ["CONJUNCTION_OR", (_node, children) => SqlGuardService.readOrConstraints(children)],
    ["COMPARE_EQUAL", (node) => SqlGuardService.readEqualityOf(node)],
    ["COMPARE_IN", (_node, children) => SqlGuardService.readInList(children)],
  ]);

  // Why: a strict bound is read as inclusive, which only loads more and never less; the SQL itself still filters the exact rows.
  static readonly BOTH_SIDES: ComparisonSides = { whenColumnLeft: ["from", "to"], whenColumnRight: ["from", "to"] };
  static readonly LOWER_BOUND: ComparisonSides = { whenColumnLeft: ["from"], whenColumnRight: ["to"] };
  static readonly UPPER_BOUND: ComparisonSides = { whenColumnLeft: ["to"], whenColumnRight: ["from"] };

  // Why: a period bound is read from a comparison with the column on either side.
  static readonly PERIOD_NODE_TO_READER: ReadonlyMap<PeriodNodeType, PeriodReader>
    = new Map<PeriodNodeType, PeriodReader>([
      ["CONJUNCTION_AND", (_node, children) => children.flatMap((child) => SqlGuardService.readPeriodConstraints(child))],
      ["COMPARE_BETWEEN", (node) => SqlGuardService.readPeriodBetween(node)],
      ["COMPARE_IN", (_node, children) => SqlGuardService.readPeriodIn(children)],
      ["COMPARE_EQUAL", (node) => SqlGuardService.readPeriodComparison(node, SqlGuardService.BOTH_SIDES)],
      ["COMPARE_GREATERTHANOREQUALTO", (node) => SqlGuardService.readPeriodComparison(node, SqlGuardService.LOWER_BOUND)],
      ["COMPARE_GREATERTHAN", (node) => SqlGuardService.readPeriodComparison(node, SqlGuardService.LOWER_BOUND)],
      ["COMPARE_LESSTHANOREQUALTO", (node) => SqlGuardService.readPeriodComparison(node, SqlGuardService.UPPER_BOUND)],
      ["COMPARE_LESSTHAN", (node) => SqlGuardService.readPeriodComparison(node, SqlGuardService.UPPER_BOUND)],
    ]);

  static readonly MAX_ASSETS = 50;
  static readonly GUIDE_POINTER = "For the syntax and the filters, read the guide topic \"sql\" with get_guide.";

  private readonly parser: DatabasePort;

  constructor(parser: DatabasePort) {
    this.parser = parser;
  }

  private static buildRefusal(message: string): GuardVerdict {
    // Why: every refusal names the guide topic that teaches the syntax and the filters (issue #56, S1).
    return { isAccepted: false, message: `${message} ${SqlGuardService.GUIDE_POINTER}` };
  }

  async checkSql(sql: string): Promise<GuardVerdict> {
    // Why: json_serialize_sql accepts a single SELECT only, so PRAGMA, COPY, ATTACH, INSTALL, LOAD and every change of data stop here.
    const rows = await this.parser.readRows("SELECT json_serialize_sql(?) AS ast", [sql]);
    const astText = String(rows[0]?.ast);
    const parsed = ParsedSqlSchema.parse(JSON.parse(astText));
    if (parsed.error) {
      const message = SqlGuardService.describeParserError(parsed.error_type, parsed.error_message);
      return SqlGuardService.buildRefusal(message);
    }
    const statements = parsed.statements ?? [];
    if (statements.length !== 1) {
      return SqlGuardService.buildRefusal("Send exactly one SELECT statement per query.");
    }
    const selects = statements.flatMap((statement) => SqlGuardService.collectSelects(statement.node));
    const cteNames = selects.flatMap((select) => SqlGuardService.readCteNames(select));
    const cteProblems = cteNames
      .filter((name) => SqlGuardService.isDataTable(name))
      .map((name) => `A WITH name cannot be the name of a data table: rename ${name}.`);
    const checks = selects.map((select) => SqlGuardService.checkSelect(select, cteNames));
    const problems = [...cteProblems, ...checks.flatMap((check) => check.problems)];
    if (problems.length > 0) {
      return SqlGuardService.buildRefusal(problems.join("\n"));
    }
    const requirements = checks.flatMap((check) => check.requirements);
    if (requirements.length > SqlGuardService.MAX_ASSETS) {
      const message = `One query can load at most ${SqlGuardService.MAX_ASSETS} assets; this one asks for ${requirements.length}. Filter fewer tickers.`;
      return SqlGuardService.buildRefusal(message);
    }
    return { isAccepted: true, requirements };
  }

  static isDataTable(name: string): name is DataTable {
    return Object.hasOwn(SqlGuardService.TABLE_TO_FILTERS, name);
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
    const whereClause: unknown = Reflect.get(select as object, "where_clause");
    const conditions = [whereClause, ...from.joinConditions];
    const constraints = [
      ...conditions.flatMap((condition) => SqlGuardService.readConstraints(condition)),
      ...from.constraints,
    ];
    const periodConstraints = conditions.flatMap((condition) => SqlGuardService.readPeriodConstraints(condition));
    const dataRefs = from.refs.filter((ref) => {
      return !cteNames.includes(ref.name.toLowerCase()) && SqlGuardService.isDataTable(ref.table);
    });
    const checks = dataRefs.map((ref) => SqlGuardService.checkRef(ref, {
      isSingleRef: dataRefs.length === 1,
      constraints,
      periodConstraints,
    }));
    return {
      problems: [...from.problems, ...checks.flatMap((check) => check.problems)],
      requirements: checks.flatMap((check) => check.requirements),
    };
  }

  private static readFrom(select: unknown): FromReading {
    const refs: TableRef[] = [];
    const joinConditions: unknown[] = [];
    const problems: string[] = [];
    const constraints: Constraint[] = [];
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
      if (tableFunction.success && tableFunction.data.function.function_name.toLowerCase() === SEARCH_MACRO) {
        const reading = SqlGuardService.readSearchMacro(tableFunction.data.function.arguments ?? []);
        problems.push(...reading.problems);
        constraints.push(...reading.constraints);
        if (reading.problems.length === 0) {
          refs.push({ table: "asset_filing_chunks", name: SEARCH_MACRO });
        }
        return;
      }
      if (tableFunction.success) {
        problems.push(`${tableFunction.data.function.function_name}(...) is not available in query_sql yet. `
          + "Read the table it reads instead, with its filters.");
      }
    };
    visit(Reflect.get(select as object, "from_table"));
    return { refs, joinConditions, problems, constraints };
  }

  private static isSearchMode(value: unknown): value is SearchMode {
    return SEARCH_MACRO_MODES.some((known) => known === value);
  }

  private static readSearchMacro(args: readonly { expression?: unknown }[]): MacroReading {
    const expected = `search_chunks takes ${SEARCH_MACRO_ARGUMENT_COUNT} arguments: query text, asset_id, document_type, section (NULL for no section) and mode ('text').`;
    if (args.length !== SEARCH_MACRO_ARGUMENT_COUNT) {
      return { problems: [expected], constraints: [] };
    }
    const values = args.map((argument) => SqlGuardService.readConstant(argument.expression));
    const [queryText] = values;
    if (queryText === undefined || queryText === null) {
      return { problems: ["search_chunks needs the query text as a literal string, first."], constraints: [] };
    }
    const mode = values[SEARCH_MACRO_FILTERS.length + 1];
    if (!SqlGuardService.isSearchMode(mode)) {
      return { problems: [`search_chunks mode ${mode ?? "NULL"} is not available; the modes are ${SEARCH_MACRO_MODES.join(", ")}.`], constraints: [] };
    }
    // Why: a NULL argument is no filter, so it adds no constraint.
    const constraints = SEARCH_MACRO_FILTERS.flatMap((column, index): Constraint[] => {
      const value = values[index + 1];
      if (typeof value !== "string") {
        return [];
      }
      return [{ column, qualifier: SEARCH_MACRO, values: [value] }];
    });
    return { problems: [], constraints };
  }

  private static readConstant(expression: unknown): string | null | undefined {
    const constant = ConstantExpressionSchema.safeParse(expression);
    if (!constant.success) {
      return undefined;
    }
    const { literal } = constant.data;
    // Why: NULL means no filter, so it is told apart from a column or a function, which are not literals (undefined).
    const isNull = literal.kind === "NULL_LITERAL";
    return isNull ? null : literal.text;
  }

  private static checkRef(ref: TableRef, scope: RefScope): SelectCheck {
    const table = ref.table as DataTable;
    const alias = ref.name.toLowerCase();
    const filters = SqlGuardService.TABLE_TO_FILTERS[table];
    const readValues = (column: string): string[] | undefined => {
      return SqlGuardService.readValues(scope.constraints, column, alias, scope.isSingleRef);
    };
    const missing = filters.columns.filter((column) => readValues(column) === undefined);
    const hasAnyOf = filters.anyOf.length === 0 || filters.anyOf.some((column) => readValues(column) !== undefined);
    if (missing.length > 0 || !hasAnyOf) {
      const needed = [...missing, ...(hasAnyOf ? [] : [filters.anyOf.join(" or ")])];
      return { problems: [SqlGuardService.describeMissing(ref, needed)], requirements: [] };
    }
    const assets = SqlGuardService.readAssets(readValues("asset_id") ?? []);
    if (assets.invalid.length > 0) {
      const problem = `asset_id ${assets.invalid.join(", ")} is not market:asset_type:code, for example BR:stock:PETR4`;
      return { problems: [problem], requirements: [] };
    }
    const categories = SqlGuardService.readCategories(table, readValues);
    if (categories.problems.length > 0) {
      return { problems: categories.problems, requirements: [] };
    }
    const requirements = SqlGuardService.buildRequirements(table, categories.categories, assets.parts, readValues);
    const periodColumn = PeriodService.TABLE_TO_PERIOD_COLUMN[table];
    if (periodColumn === undefined) {
      return { problems: [], requirements };
    }
    const period = SqlGuardService.readPeriodBounds(scope, periodColumn, alias);
    if (period.from !== undefined && period.to !== undefined && period.from > period.to) {
      return { problems: [SqlGuardService.describeEmptyPeriod(ref, period)], requirements: [] };
    }
    return { problems: [], requirements: requirements.map((requirement) => ({ ...requirement, period })) };
  }

  private static readAssets(assetIds: readonly string[]): AssetReading {
    // Why: a query names the assets it reads by asset_id; an id that does not have the form market:asset_type:code is refused, not guessed.
    const parts: AssetIdParts[] = [];
    const invalid: string[] = [];
    for (const assetId of assetIds) {
      const read = AssetIdUtil.parse(assetId);
      if (read === undefined) {
        invalid.push(assetId);
      } else {
        parts.push(read);
      }
    }
    return { parts, invalid };
  }

  private static readCategories(
    table: DataTable,
    readValues: (column: string) => string[] | undefined,
  ): CategoryReading {
    const reader = SqlGuardService.TABLE_TO_CATEGORY_READER[table];
    if (reader !== undefined) {
      return reader(readValues);
    }
    const category = SqlGuardService.TABLE_TO_CATEGORY[table];
    return { categories: category === undefined ? [] : [category], problems: [] };
  }

  private static readFilingCategories(readValues: (column: string) => string[] | undefined): CategoryReading {
    // Why: a filing type is listed by the category that lists it (issue #42, S1): a disclosure type (FRE, VLMO, CGVN) by the disclosures, any other by the filings; a query naming both kinds loads both.
    const types = readValues("document_type") ?? [];
    const categories: CacheCategory[] = [];
    if (types.length === 0 || types.some((type) => !DisclosureTypeUtil.isDisclosure(type))) {
      categories.push("filings");
    }
    if (types.some((type) => DisclosureTypeUtil.isDisclosure(type))) {
      categories.push("disclosures");
    }
    return { categories, problems: [] };
  }

  private static readMetricCategories(readValues: (column: string) => string[] | undefined): CategoryReading {
    // Why: a metric names the category that fills it; a metric with an unknown first word is refused with the words it may use.
    const groups = (readValues("metric") ?? []).map((metric) => metric.split(".")[0] ?? "");
    const unknown = groups.filter((group) => !Object.hasOwn(SqlGuardService.METRIC_GROUP_TO_CATEGORY, group));
    if (unknown.length > 0) {
      const known = Object.keys(SqlGuardService.METRIC_GROUP_TO_CATEGORY).join(", ");
      return { categories: [], problems: [`metric group ${unknown.join(", ")} is not known; the groups are ${known}`] };
    }
    // Why: every group was checked against the table above, so each one is a known group.
    const categories = [...new Set(groups)].map(
      (group) => SqlGuardService.METRIC_GROUP_TO_CATEGORY[group as MetricGroup],
    );
    return { categories, problems: [] };
  }

  private static buildRequirements(
    table: DataTable,
    categories: readonly CacheCategory[],
    assets: readonly AssetIdParts[],
    readValues: (column: string) => string[] | undefined,
  ): Requirement[] {
    const selectors = SqlGuardService.readFilingSelectors(table, readValues);
    return assets.flatMap((asset) => categories.flatMap((category) => selectors.map((selector) => ({
      ...selector,
      table,
      category,
      market: asset.market,
      ticker: asset.code,
      assetType: asset.assetType,
    }))));
  }

  private static readFilingSelectors(
    table: DataTable,
    readValues: (column: string) => string[] | undefined,
  ): FilingSelector[] {
    if (table !== "asset_filing_chunks") {
      return [{}];
    }
    // Why: a chunk load names one filing, or every filing of one document type; the loader never downloads the other filings of the company.
    const filingIds = readValues("filing_id");
    if (filingIds !== undefined) {
      return filingIds.map((filingId) => ({ filingId }));
    }
    return (readValues("document_type") ?? []).map((filingType) => ({ filingType }));
  }

  private static readPeriodBounds(scope: RefScope, periodColumn: string, alias: string): PeriodBounds {
    const matching = scope.periodConstraints.filter((constraint) => {
      const isForThisRef = constraint.qualifier === undefined ? scope.isSingleRef : constraint.qualifier === alias;
      return isForThisRef && constraint.column === periodColumn;
    });
    // Why: each bound of a period is the narrowest one the query states, so the window covers every row the query can keep.
    const froms = matching.filter((constraint) => constraint.side === "from").map((constraint) => constraint.date);
    const tos = matching.filter((constraint) => constraint.side === "to").map((constraint) => constraint.date);
    const from = froms.toSorted().at(-1);
    const to = tos.toSorted().at(0);
    return {
      ...(from === undefined ? {} : { from }),
      ...(to === undefined ? {} : { to }),
    };
  }

  private static describeEmptyPeriod(ref: TableRef, period: PeriodBounds): string {
    return `The period of ${ref.table} starts after it ends (${period.from ?? ""} to ${period.to ?? ""}). `
      + "Give the period as from <= to, for example period_end BETWEEN '2024-01-01' AND '2024-12-31'.";
  }

  private static readPeriodConstraints(node: unknown): PeriodConstraint[] {
    const shape = SqlGuardService.readNodeShape(node);
    if (shape === undefined) {
      return [];
    }
    const reader = SqlGuardService.PERIOD_NODE_TO_READER.get(shape.type as PeriodNodeType);
    return reader === undefined ? [] : reader(node, shape.children);
  }

  private static readNodeShape(node: unknown): NodeShape | undefined {
    if (typeof node !== "object" || node === null) {
      return undefined;
    }
    // Why: both condition walkers read the same two fields of a node, so the shape is read in one place.
    const children: unknown = Reflect.get(node, "children");
    return { type: Reflect.get(node, "type"), children: Array.isArray(children) ? children : [] };
  }

  private static readPeriodComparison(node: unknown, sides: ComparisonSides): PeriodConstraint[] {
    const equality = EqualityNodeSchema.safeParse(node);
    if (!equality.success) {
      return [];
    }
    const { left, right } = equality.data;
    const columnLeft = SqlGuardService.readColumn(left);
    const dateRight = SqlGuardService.readDate(right);
    if (columnLeft !== undefined && dateRight !== undefined) {
      return sides.whenColumnLeft.map((side) => ({ ...columnLeft, side, date: dateRight }));
    }
    const columnRight = SqlGuardService.readColumn(right);
    const dateLeft = SqlGuardService.readDate(left);
    if (columnRight !== undefined && dateLeft !== undefined) {
      return sides.whenColumnRight.map((side) => ({ ...columnRight, side, date: dateLeft }));
    }
    return [];
  }

  private static readPeriodBetween(node: unknown): PeriodConstraint[] {
    const between = BetweenNodeSchema.safeParse(node);
    if (!between.success) {
      return [];
    }
    const column = SqlGuardService.readColumn(between.data.input);
    const lower = SqlGuardService.readDate(between.data.lower);
    const upper = SqlGuardService.readDate(between.data.upper);
    if (column === undefined || lower === undefined || upper === undefined) {
      return [];
    }
    return [{ ...column, side: "from", date: lower }, { ...column, side: "to", date: upper }];
  }

  private static readPeriodIn(children: unknown[]): PeriodConstraint[] {
    const [subject, ...values] = children;
    const column = SqlGuardService.readColumn(subject);
    const dates = values.flatMap((value) => {
      const date = SqlGuardService.readDate(value);
      return date === undefined ? [] : [date];
    });
    if (column === undefined || dates.length === 0 || dates.length !== values.length) {
      return [];
    }
    const [first = "", ...rest] = dates.toSorted();
    const last = rest.at(-1) ?? first;
    return [{ ...column, side: "from", date: first }, { ...column, side: "to", date: last }];
  }

  private static readDate(node: unknown): string | undefined {
    const cast = OperatorCastSchema.safeParse(node);
    const literalNode = cast.success ? cast.data.child : node;
    const literal = StringConstantSchema.safeParse(literalNode);
    if (!literal.success) {
      return undefined;
    }
    const text = literal.data.literal.text;
    return PeriodService.isDate(text) ? text : undefined;
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
      + "Example: WHERE asset_id = 'BR:stock:PETR4'. "
      + "A filter that is a function, a subquery or one branch of an OR is not read as a filter.";
  }

  private static readConstraints(node: unknown): Constraint[] {
    const shape = SqlGuardService.readNodeShape(node);
    if (shape === undefined) {
      return [];
    }
    const reader = SqlGuardService.findConditionReader(shape.type);
    if (reader === undefined) {
      return [];
    }
    return reader(node, shape.children);
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
