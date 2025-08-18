import { DoublyLinkedList } from '@datastructures-js/linked-list';
import assert from 'assert';

type PerfPoint = {
  timestamp: number;
  value: number;
};

const WINDOW_RECALC_MS = 2000;
class AvgProfiler {
  private average = 0;
  private sum = 0;
  private points = new DoublyLinkedList<PerfPoint>();
  private lastRecalcTime = 0;

  constructor(private durationSec: number) {}

  putPoint(value: number) {
    const now = Date.now();

    if (now - this.lastRecalcTime < WINDOW_RECALC_MS) {
      this.points.insertLast({ timestamp: now, value });
      // last window recalc was less than 2 seconds ago then don't touch points list
      this.sum += value;
      this.average = this.sum / this.points.count();
      return;
    }

    let newSum = this.sum + value;

    const oldCount = this.points.count();
    while (
      !this.points.isEmpty() &&
      now - this.points.head().getValue().timestamp > this.durationSec * 1000
    ) {
      newSum -= this.points.head().getValue().value;
      this.points.removeFirst();
    }

    this.points.insertLast({ timestamp: now, value });
    this.average = newSum / this.points.count();
    this.sum = newSum;
    this.lastRecalcTime = now;
  }

  getAvg(): number {
    return this.average;
  }

  getSum(): number {
    return this.sum;
  }

  getCount(): number {
    return this.points.count();
  }
}

class ProfileStats {
  totalTime = 0;
  count = 0;
  profiler1min = new AvgProfiler(1 * 60);
  profiler5min = new AvgProfiler(5 * 60);
  profiler15min = new AvgProfiler(15 * 60);
}
export class Profiler {
  private stats = new Map<string, ProfileStats>();
  private readonly printIntervalMs: number;

  constructor(printIntervalMs = 60000) {
    this.printIntervalMs = printIntervalMs;

    setInterval(() => this.printStats(), printIntervalMs);
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

  profileSync<T>(name: string, fn: () => T): T {
    const start = performance.now();
    try {
      return fn();
    } finally {
      const time = performance.now() - start;
      this.recordStat(name, time);
    }
  }

  private recordStat(name: string, time: number) {
    let stat = this.stats.get(name);
    if (!stat) {
      stat = new ProfileStats();
      this.stats.set(name, stat);
    }

    stat.profiler1min.putPoint(time);
    stat.profiler5min.putPoint(time);
    stat.profiler15min.putPoint(time);
    stat.totalTime += time;
    stat.count++;
  }

  private printStats() {
    //return;
    const sortedStats = [...this.stats.entries()]
      .map(([name, stat]) => ({
        name,
        avgTime: stat.totalTime / stat.count,
        totalTime: stat.totalTime,
        count: stat.count,
        cnt1min: stat.profiler1min.getCount(),
        cnt5min: stat.profiler5min.getCount(),
        cnt15min: stat.profiler15min.getCount(),
        avg1min: stat.profiler1min.getAvg(),
        avg5min: stat.profiler5min.getAvg(),
        avg15min: stat.profiler15min.getAvg(),
        sum1min: stat.profiler1min.getSum(),
        sum5min: stat.profiler5min.getSum(),
        sum15min: stat.profiler15min.getSum(),
      }))
      .sort((a, b) => b.totalTime - a.totalTime);

    if (sortedStats.length === 0) {
      return;
    }
    console.table(
      sortedStats.map((s) => ({
        Operation: s.name,
        'Avg [tot]': s.avgTime.toFixed(2),
        'Sum [tot]': (s.totalTime / 1000).toFixed(2),
        'Cnt [tot]': s.count,
        'Avg [1m]': s.avg1min.toFixed(2),
        'Sum [1m]': (s.sum1min / 1000).toFixed(2),
        'Cnt [1m]': s.cnt1min,
        'Avg [5m]': s.avg5min.toFixed(2),
        'Sum [5m]': (s.sum5min / 1000).toFixed(2),
        'Cnt [5m]': s.cnt5min,
        'Avg [15m]': s.avg15min.toFixed(2),
        'Sum [15m]': (s.sum15min / 1000).toFixed(2),
        'Cnt [15m]': s.cnt15min,
      })),
    );
  }
}

// Tests for AvgProfiler
if (require.main === module) {
  console.log('Running AvgProfiler tests...');

  // Test 1: Basic average calculation
  (() => {
    const profiler = new AvgProfiler(60);
    profiler.putPoint(100);
    profiler.putPoint(200);
    profiler.putPoint(300);
    assert.strictEqual(profiler.getAvg(), 200, 'Basic average should be 200');
    console.log('✓ Basic average calculation');
  })();

  // Test 2: Points expiration
  (() => {
    const profiler = new AvgProfiler(1); // 1 second window
    profiler.putPoint(100);
    profiler.putPoint(200);

    // Simulate time passing
    const originalNow = Date.now;
    try {
      Date.now = () => originalNow() + 2000; // 2 seconds later
      profiler.putPoint(300);
      assert.strictEqual(profiler.getAvg(), 300, 'After expiration, only last point should remain');
    } finally {
      Date.now = originalNow; // Restore original Date.now
    }
    console.log('✓ Points expiration');
  })();

  // Test 3: Empty profiler
  (() => {
    const profiler = new AvgProfiler(60);
    assert.strictEqual(profiler.getAvg(), 0, 'Empty profiler should return 0');
    console.log('✓ Empty profiler');
  })();

  // Test 4: Single point
  (() => {
    const profiler = new AvgProfiler(60);
    profiler.putPoint(100);
    assert.strictEqual(profiler.getAvg(), 100, 'Single point should return its value');
    console.log('✓ Single point');
  })();

  // Test 5: Window boundary
  (() => {
    const profiler = new AvgProfiler(1); // 1 second window
    const originalNow = Date.now;
    let currentTime = originalNow();

    try {
      Date.now = () => currentTime;

      profiler.putPoint(100); // t=0
      currentTime += 500; // t=0.5s
      profiler.putPoint(200); // still within window
      assert.strictEqual(profiler.getAvg(), 150, 'Both points should be included');

      currentTime += 600; // t=1.1s
      profiler.putPoint(300); // first point should expire
      assert.strictEqual(profiler.getAvg(), 250, 'Only last two points should remain');
    } finally {
      Date.now = originalNow;
    }
    console.log('✓ Window boundary');
  })();

  // Test 6: Large numbers
  (() => {
    const profiler = new AvgProfiler(60);
    profiler.putPoint(1000000);
    profiler.putPoint(2000000);
    assert.strictEqual(profiler.getAvg(), 1500000, 'Should handle large numbers');
    console.log('✓ Large numbers');
  })();

  // Test 7: Rapid updates
  (() => {
    const profiler = new AvgProfiler(1);
    for (let i = 0; i < 1000; i++) {
      profiler.putPoint(i);
    }
    assert(profiler.getAvg() >= 0, 'Should handle rapid updates without errors');
    console.log('✓ Rapid updates');
  })();

  console.log('All tests passed! ✨');
}
