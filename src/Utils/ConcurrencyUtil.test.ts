import { describe, expect, it } from "vitest";
import { ConcurrencyUtil } from "@/Utils/ConcurrencyUtil.ts";

const waitSteps = async (steps: number): Promise<void> => {
  for (let step = 0; step < steps; step += 1) {
    await Promise.resolve();
  }
};

describe("ConcurrencyUtil.mapWithLimit()", () => {
  describe("when the work finishes in a different order", () => {
    it("keeps the results in the order of the items", async () => {
      const results = await ConcurrencyUtil.mapWithLimit([3, 1, 2], 2, async (steps) => {
        await waitSteps(steps);
        return steps * 10;
      });

      expect(results).toStrictEqual([30, 10, 20]);
    });
  });

  describe("when there are more items than the limit", () => {
    it("never runs more work at once than the limit", async () => {
      let running = 0;
      let maxRunning = 0;
      await ConcurrencyUtil.mapWithLimit(["a", "b", "c", "d", "e"], 2, async () => {
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        await waitSteps(1);
        running -= 1;
      });

      expect(maxRunning).toBe(2);
    });
  });
});
