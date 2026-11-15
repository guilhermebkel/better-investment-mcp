export const TOP_CUTOFF = 5;
export const MRR_CUTOFF = 10;
const DECIMALS = 1000;
const HALF = 2;
const FIRST_RANK = 1;

export const rankOfFirstRelevant = (top, relevantSeqs) => {
  const relevant = new Set(relevantSeqs);
  const index = top.slice(0, MRR_CUTOFF).findIndex((seq) => relevant.has(seq));
  return index === -1 ? null : index + FIRST_RANK;
};

export const readMedian = (values) => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / HALF);
  const isEven = sorted.length % HALF === 0;
  const upper = sorted[middle] ?? 0;
  const lower = sorted[middle - FIRST_RANK] ?? upper;
  return isEven ? (lower + upper) / HALF : upper;
};

export const scoreMode = (answers) => {
  const ranks = answers.map((answer) => rankOfFirstRelevant(answer.top, answer.relevantSeqs));
  const hitsTop5 = ranks.filter((rank) => rank !== null && rank <= TOP_CUTOFF).length;
  const hitsTop10 = ranks.filter((rank) => rank !== null).length;
  const reciprocal = ranks.reduce((sum, rank) => sum + (rank === null ? 0 : FIRST_RANK / rank), 0);
  const matched = answers.map((answer) => answer.matched);
  return {
    hitsTop5,
    hitsTop10,
    questions: answers.length,
    mrr: Math.round((reciprocal / Math.max(answers.length, FIRST_RANK)) * DECIMALS) / DECIMALS,
    medianMatched: readMedian(matched),
    zeroResults: matched.filter((count) => count === 0).length,
  };
};

export const formatTable = (rows) => {
  const header = "| How the query was written | Hits in top 5 | Hits in top 10 | MRR@10 | Median chunks matched | Queries with zero results |";
  const separator = "| --- | --- | --- | --- | --- | --- |";
  const lines = rows.map((row) => {
    const { score } = row;
    return `| ${row.label} | ${score.hitsTop5}/${score.questions} | ${score.hitsTop10}/${score.questions} | ${score.mrr} | ${score.medianMatched} | ${score.zeroResults} |`;
  });
  return [header, separator, ...lines].join("\n");
};

export const readRelevantSeqs = (question, quoteToSeqs) => {
  const seqs = new Set();
  for (const relevant of question.relevant) {
    const found = quoteToSeqs.get(relevant.quote) ?? [];
    if (found.length === 0) {
      throw new Error(`question ${question.id}: the quote "${relevant.quote}" matches no chunk of its filing; the question is stale`);
    }
    for (const seq of found) {
      seqs.add(seq);
    }
  }
  return [...seqs];
};
