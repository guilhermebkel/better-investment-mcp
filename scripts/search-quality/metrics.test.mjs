import { describe, expect, it } from "vitest";
import { formatTable, readMedian, rankOfFirstRelevant, readRelevantSeqs, scoreMode } from "./metrics.mjs";

describe("rankOfFirstRelevant()", () => {
  it("ranks the first relevant chunk at 1 when it is the top result", () => {
    expect(rankOfFirstRelevant([7, 3, 9], [7])).toBe(1);
  });

  it("ranks the first relevant chunk at 3 when it is third", () => {
    expect(rankOfFirstRelevant([1, 2, 5, 9], [5, 9])).toBe(3);
  });

  it("gives null when no chunk of the top 10 is relevant", () => {
    expect(rankOfFirstRelevant([1, 2, 3], [8])).toBeNull();
  });
});

describe("readMedian()", () => {
  it("takes the middle of an odd count", () => {
    expect(readMedian([5, 1, 9])).toBe(5);
  });

  it("takes the mean of the two middle values of an even count", () => {
    expect(readMedian([1, 2, 3, 10])).toBe(2.5);
  });

  it("gives zero for no question", () => {
    expect(readMedian([])).toBe(0);
  });
});

describe("scoreMode()", () => {
  it("counts hits in the top 5 and top 10, MRR@10, the median and the zero results by hand", () => {
    const answers = [
      { top: [7, 3, 9], relevantSeqs: [7], matched: 4 },
      { top: [1, 2, 5, 9], relevantSeqs: [5], matched: 0 },
      { top: [1, 2, 3], relevantSeqs: [8], matched: 10 },
    ];

    const score = scoreMode(answers);

    expect(score.hitsTop5).toBe(2);
    expect(score.hitsTop10).toBe(2);
    expect(score.mrr).toBe(0.444);
    expect(score.medianMatched).toBe(4);
    expect(score.zeroResults).toBe(1);
  });

  it("counts a first relevant chunk below the top 5 as a top 10 hit only", () => {
    const score = scoreMode([{ top: [1, 2, 3, 4, 5, 6, 7], relevantSeqs: [7], matched: 3 }]);

    expect(score.hitsTop5).toBe(0);
    expect(score.hitsTop10).toBe(1);
    expect(score.mrr).toBe(0.143);
  });
});

describe("readRelevantSeqs()", () => {
  it("collects the chunks of every quote of a question", () => {
    const question = { id: "T1", relevant: [{ item: "1.4", quote: "a" }, { item: "1.4", quote: "b" }] };
    const quoteToSeqs = new Map([["a", [2]], ["b", [5, 2]]]);

    expect(readRelevantSeqs(question, quoteToSeqs).sort((left, right) => left - right)).toStrictEqual([2, 5]);
  });

  it("stops with the question id when a quote matches no chunk (AC4)", () => {
    const question = { id: "T9", relevant: [{ item: "1.4", quote: "gone" }] };

    expect(() => readRelevantSeqs(question, new Map())).toThrow("question T9");
  });
});

describe("formatTable()", () => {
  it("prints one row per mode with the columns of the baseline table", () => {
    const table = formatTable([{ label: "keywords", score: { questions: 30, hitsTop5: 30, hitsTop10: 30, mrr: 0.846, medianMatched: 165, zeroResults: 0 } }]);

    expect(table.split("\n")[2]).toBe("| keywords | 30/30 | 30/30 | 0.846 | 165 | 0 |");
  });
});
