import { sleep } from '@clickhouse/client-common';
import _ from 'lodash';
import * as process from 'node:process';
import { Logger, pino } from 'pino';

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

type ChRetryOptions = {
  logger: Logger;
  desc: string;
  attempts: number;
  initBackoffMs: number;
  multiplier: number;
};

const CH_RETRY_DEFAULTS: ChRetryOptions = {
  logger: createLogger('clickhouse'),
  desc: 'Clickhouse query',
  attempts: 5,
  initBackoffMs: 100,
  multiplier: 2,
};

export async function chRetry<R>(
  query: () => Promise<R>,
  options?: Partial<ChRetryOptions>,
): Promise<R> {
  const { desc, attempts, initBackoffMs, logger, multiplier } = _.merge(
    CH_RETRY_DEFAULTS,
    options || {},
  );
  let attempt = 1;
  let waitTime = initBackoffMs;
  while (true) {
    try {
      logger.debug(`Trying: ${desc} (attempt ${attempt}/${attempts})`);
      const res = await query();
      return res;
    } catch (err) {
      logger.error(err, `Error: ${desc}`);

      if (
        err instanceof Error &&
        'code' in err &&
        (err.code === 'ECONNRESET' || err.code === 'EPIPE')
      ) {
        ++attempt;
        if (attempt > attempts) {
          logger.error(`Max attempts reached: ${desc}`);
        } else {
          logger.info(`Clickhouse socket error detected. Retrying after ${waitTime}ms...`);
          await sleep(waitTime);
          waitTime *= multiplier;
          continue;
        }
      }

      throw err;
    }
  }
}
