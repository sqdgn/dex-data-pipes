import * as os from 'os';

export class SystemMonitoring {
  constructor(printIntervalSec: number = 60) {
    setInterval(() => {
      this.printCPUUsage();
      this.printMemoryUsage();
    }, 1000 * printIntervalSec);
  }

  getCPUUsage() {
    const cpus = os.cpus();
    let totalIdle = 0,
      totalTick = 0;

    cpus.forEach((cpu) => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });

    return { idle: totalIdle / cpus.length, total: totalTick / cpus.length };
  }

  printCPUUsage() {
    const startMeasure = this.getCPUUsage();

    setTimeout(() => {
      const endMeasure = this.getCPUUsage();

      const idleDifference = endMeasure.idle - startMeasure.idle;
      const totalDifference = endMeasure.total - startMeasure.total;
      const cpuUsage = (1 - idleDifference / totalDifference) * 100;

      console.log(`CPU Usage: ${cpuUsage.toFixed(2)}%`);
    }, 1000);
  }

  printMemoryUsage() {
    const formatMemory = (bytes: number) => (bytes / 1024 / 1024).toFixed(2) + ' MB';
    const memoryUsage = process.memoryUsage();

    console.log(
      `Memory Usage: RSS: ${formatMemory(memoryUsage.rss)} ` +
        `Heap Total: ${formatMemory(memoryUsage.heapTotal)} ` +
        `Heap Used: ${formatMemory(memoryUsage.heapUsed)} ` +
        `External: ${formatMemory(memoryUsage.external)} ` +
        `Array Buffers: ${formatMemory(memoryUsage.arrayBuffers)} `,
    );
  }
}
