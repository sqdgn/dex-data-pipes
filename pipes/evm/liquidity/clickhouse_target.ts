import { chRetry } from '../../../common/chRetry';
import { clickhouseTarget } from '@subsquid/pipes/targets/clickhouse';
import { NodeClickHouseClient } from '@clickhouse/client/dist/client';
import { Logger } from '@sqdgn/context-logging/context';
import { RawLiquidityEvent } from './types';
import { Ctx } from '@sqd-pipes/pipes';

export const createTarget = async (client: NodeClickHouseClient, logger: Logger) =>
  clickhouseTarget({
    client,
    onRollback: async () => {},
    onData: async ({ data, ctx }: { data: RawLiquidityEvent[]; ctx: Ctx }) => {
      try {
        await chRetry(
          logger,
          'liquidity_events_raw insert',
          async () =>
            await client.insert({
              table: `liquidity_events_raw`,
              values: data.map((s) => {
                return s;
              }),
              format: 'JSONEachRow',
            }),
        );
      } catch (err) {
        logger.error({ err }, `error inserting data: ${(err as any).message || 'unknown'}`);
        throw err;
      }
    },
  });
