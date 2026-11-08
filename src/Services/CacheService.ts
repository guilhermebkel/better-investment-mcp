import { randomUUID } from "node:crypto";
import type { CacheCategory, CacheLoadResult, CacheRunOutcome, CacheRunStart } from "@/Protocols/CacheProtocol.ts";
import type { DatabasePort } from "@/Protocols/DatabaseProtocol.ts";
import type { PeriodWindow } from "@/Protocols/PeriodProtocol.ts";
import { FreshRunRowsSchema, SourceRowsSchema } from "@/Schemas/CacheSchema.ts";

export class CacheService {
  private readonly writer: DatabasePort;
  private readonly nowMs: () => number;
  private readonly ttlMs: number;
  private readonly keyToInFlightLoad = new Map<string, Promise<CacheLoadResult>>();

  constructor(writer: DatabasePort, nowMs: () => number, ttlMs: number) {
    this.writer = writer;
    this.nowMs = nowMs;
    this.ttlMs = ttlMs;
  }

  async startRun(run: CacheRunStart): Promise<string> {
    const runId = randomUUID();
    await this.writer.run(
      "INSERT INTO cache_runs (run_id, category, market, ticker, source, started_at, filing_id, period_from, period_to) VALUES (?, ?, ?, ?, ?, CAST(? AS TIMESTAMPTZ), ?, CAST(? AS DATE), CAST(? AS DATE))",
      [
        runId, run.category, run.market, run.ticker, run.source, this.formatIso(this.nowMs()), run.filingId ?? null,
        run.period?.from ?? null, run.period?.to ?? null,
      ],
    );
    return runId;
  }

  async finishRun(runId: string, outcome: CacheRunOutcome): Promise<void> {
    const isFailed = outcome.errorMessage !== undefined;
    const expiresAt = isFailed ? null : this.formatIso(this.nowMs() + this.ttlMs);
    await this.writer.run(
      "UPDATE cache_runs SET finished_at = CAST(? AS TIMESTAMPTZ), expires_at = CAST(? AS TIMESTAMPTZ), rows_read = CAST(? AS BIGINT), error = ? WHERE run_id = ?",
      [this.formatIso(this.nowMs()), expiresAt, outcome.rowsRead, outcome.errorMessage ?? null, runId],
    );
  }

  async isFresh(category: CacheCategory, market: string, ticker: string, window?: PeriodWindow): Promise<boolean> {
    // Why: a run of a period covers a window only when the run's own period contains it, so a load of 2024 does not answer for 2019.
    const periodCondition = window === undefined ? "" : " AND period_from <= CAST(? AS DATE) AND period_to >= CAST(? AS DATE)";
    const periodValues = window === undefined ? [] : [window.from, window.to];
    const rows = await this.writer.readRows(
      `SELECT CAST(count(*) AS INTEGER) AS freshRunCount FROM cache_runs WHERE category = ? AND market = ? AND ticker = ? AND error IS NULL AND expires_at > CAST(? AS TIMESTAMPTZ)${periodCondition}`,
      [category, market, ticker, this.formatIso(this.nowMs()), ...periodValues],
    );
    return CacheService.readFreshRunCount(rows) > 0;
  }

  async isFreshFiling(filingId: string): Promise<boolean> {
    const rows = await this.writer.readRows(
      "SELECT CAST(count(*) AS INTEGER) AS freshRunCount FROM cache_runs WHERE category = 'documents' AND filing_id = ? AND error IS NULL AND expires_at > CAST(? AS TIMESTAMPTZ)",
      [filingId, this.formatIso(this.nowMs())],
    );
    return CacheService.readFreshRunCount(rows) > 0;
  }

  runOnce(
    key: string,
    load: () => Promise<CacheLoadResult>,
  ): Promise<CacheLoadResult> {
    const inFlight = this.keyToInFlightLoad.get(key);
    // Why: two callers that ask for the same category, market and ticker at once share one load, so the vendor is called once.
    if (inFlight !== undefined) {
      return inFlight;
    }
    const started = load().finally(() => {
      this.keyToInFlightLoad.delete(key);
    });
    this.keyToInFlightLoad.set(key, started);
    return started;
  }

  async readLastSource(category: CacheCategory, market: string, ticker: string): Promise<string | undefined> {
    const rows = await this.writer.readRows(
      "SELECT source FROM cache_runs WHERE category = ? AND market = ? AND ticker = ? AND error IS NULL AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1",
      [category, market, ticker],
    );
    const [row] = SourceRowsSchema.parse(rows);
    return row?.source;
  }

  private static readFreshRunCount(rows: Record<string, unknown>[]): number {
    const [row] = FreshRunRowsSchema.parse(rows);
    return row?.freshRunCount ?? 0;
  }

  private formatIso(epochMs: number): string {
    return new Date(epochMs).toISOString();
  }
}
