import * as process from 'node:process';
import { pino } from 'pino';

export function last<T>(arr: T[]): T {
  return arr[arr.length - 1];
}

export function createLogger(ns: string) {
  return pino({
    level: process.env.LOG_LEVEL || 'info',
    messageKey: 'message',
    transport: {
      target: 'pino-pretty',
      options: {
        messageKey: 'message',
        singleLine: true,
      },
    },

    base: { ns: ns },
  });
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}
