export class ConcurrencyUtil {
  static async mapWithLimit<Item, Result>(
    items: readonly Item[],
    limit: number,
    work: (item: Item) => Promise<Result>,
  ): Promise<Result[]> {
    const queue = items.map((item, index) => ({ item, index }));
    const indexToResult = new Map<number, Result>();
    const runNext = async (): Promise<void> => {
      for (let entry = queue.shift(); entry !== undefined; entry = queue.shift()) {
        indexToResult.set(entry.index, await work(entry.item));
      }
    };
    const workerCount = Math.min(limit, items.length);
    await Promise.all(Array.from({ length: workerCount }, () => runNext()));
    const byIndex = [...indexToResult.entries()].toSorted(([first], [second]) => first - second);
    return byIndex.map(([, result]) => result);
  }
}
