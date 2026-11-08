export type GetOverviewInput = object;

export type OverviewDependencies = {
  cacheTtlSeconds: number;
  readLoaded: () => Promise<Record<string, unknown>[]>;
};
