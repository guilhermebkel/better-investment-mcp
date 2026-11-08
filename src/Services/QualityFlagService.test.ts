import { describe, expect, it } from "vitest";
import { QualityFlagService } from "@/Services/QualityFlagService.ts";

describe("QualityFlagService.buildFlags()", () => {
  it("flags a price repeated with zero volume as stale", () => {
    const flags = QualityFlagService.buildFlags([{ close: 10, volume: 100 }, { close: 10, volume: 0 }]);
    expect(flags[1]).toStrictEqual({ isStale: true, isSuspectTick: false });
  });

  it("does not flag a repeated price that traded", () => {
    const flags = QualityFlagService.buildFlags([{ close: 10, volume: 100 }, { close: 10, volume: 5 }]);
    expect(flags[1]?.isStale).toBe(false);
  });

  it("flags a move beyond the threshold that comes back the next day", () => {
    const points = [{ close: 10, volume: 1 }, { close: 13, volume: 1 }, { close: 10.2, volume: 1 }];
    const flags = QualityFlagService.buildFlags(points);
    expect(flags.map((flag) => flag.isSuspectTick)).toStrictEqual([false, true, false]);
  });

  it("does not flag a move that stays after the next day", () => {
    const points = [{ close: 10, volume: 1 }, { close: 13, volume: 1 }, { close: 13, volume: 1 }];
    const flags = QualityFlagService.buildFlags(points);
    expect(flags[1]?.isSuspectTick).toBe(false);
  });

  it("returns no flags on a clean series", () => {
    const points = [{ close: 10, volume: 1 }, { close: 10.1, volume: 1 }, { close: 10.2, volume: 1 }];
    const flags = QualityFlagService.buildFlags(points);
    expect(flags.every((flag) => !flag.isStale && !flag.isSuspectTick)).toBe(true);
  });
});
