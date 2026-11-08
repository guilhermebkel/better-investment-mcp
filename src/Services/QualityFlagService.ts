import type { QualityFlags, QualityPoint } from "@/Protocols/QualityFlagProtocol.ts";

const SUSPECT_MOVE = 0.25;
const REVERT_BAND = 0.05;

export class QualityFlagService {
  static buildFlags(points: readonly QualityPoint[]): QualityFlags[] {
    // Why: a row is flagged, never removed; a move beyond 25% in one day that comes back within 5% the next day is a bad print, and a repeated price with zero volume is stale.
    return points.map((point, index) => {
      const previous = points[index - 1];
      const next = points[index + 1];
      const isStale = previous?.close === point.close && point.volume === 0;
      const isSuspectTick = previous !== undefined
        && next !== undefined
        && Math.abs(point.close / previous.close - 1) > SUSPECT_MOVE
        && Math.abs(next.close / previous.close - 1) <= REVERT_BAND;
      return { isStale, isSuspectTick };
    });
  }
}
