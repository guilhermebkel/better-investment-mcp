export type QualityPoint = {
  close: number;
  volume: number | null;
};

export type QualityFlags = {
  isStale: boolean;
  isSuspectTick: boolean;
};
