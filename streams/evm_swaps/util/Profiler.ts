type ProfileStats = {
  totalTime: number;
  count: number;
  lastPrintTime: number;
};

export class Profiler {
  private stats = new Map<string, ProfileStats>();
  private readonly printIntervalMs: number;

  constructor(printIntervalMs = 60000) {
    this.printIntervalMs = printIntervalMs;
  }

  async profile<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      const time = performance.now() - start;
      this.recordStat(name, time);
    }
  }

  private recordStat(name: string, time: number) {
    const stat = this.stats.get(name) || { totalTime: 0, count: 0, lastPrintTime: 0 };
    stat.totalTime += time;
    stat.count++;

    if (Date.now() - stat.lastPrintTime >= this.printIntervalMs) {
      this.printStats();
      this.resetStats();
    }

    this.stats.set(name, stat);
  }

  private printStats() {
    const sortedStats = [...this.stats.entries()]
      .map(([name, stat]) => ({
        name,
        avgTime: stat.totalTime / stat.count,
        totalTime: stat.totalTime,
        count: stat.count,
      }))
      .sort((a, b) => b.totalTime - a.totalTime);

    console.table(
      sortedStats.map((s) => ({
        Operation: s.name,
        'Avg Time (ms)': s.avgTime.toFixed(2),
        'Total Time (s)': (s.totalTime / 1000).toFixed(2),
        'Call Count': s.count,
      })),
    );
  }

  private resetStats() {
    for (const stat of this.stats.values()) {
      stat.totalTime = 0;
      stat.count = 0;
      stat.lastPrintTime = Date.now();
    }
  }
}
