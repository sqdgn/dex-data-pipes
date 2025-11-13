import { EvmSwapStream } from '../../../streams/evm_swaps/evm_swap_stream';
import { PriceExtendStream } from '../../../streams/evm_swaps/price_extend_stream';
import { createClickhouseClient, ensureTables, toUnixTime } from '../../clickhouse';
import { events as UniswapV3FactoryEvents } from '../../../streams/evm_swaps/protocols/uniswap.v3/factory';
import { events as UniswapV3PoolEvents } from '../../../streams/evm_swaps/protocols/uniswap.v3/swaps';
import { createLogger } from '../../utils';
import { getConfig } from '../config';
import { chRetry } from '../../../common/chRetry';
import {
  commonAbis,
  createEvmDecoder,
  createEvmPortalSource,
  createFactory,
  DecodedEvent,
  sqliteFactoryDatabase,
} from '@sqd-pipes/pipes/evm';
import { createClickhouseTarget } from '@sqd-pipes/pipes/targets/clickhouse';
import { createNodeMetricsServer } from '@sqd-pipes/pipes/metrics/node';
import { sqliteCacheAdapter } from '@sqd-pipes/pipes/portal-cache';
import { DatabaseSync } from 'node:sqlite';
import { initializeLogger } from '@sqdgn/context-logging/logger';
import { NodeClickHouseClient } from '@clickhouse/client/dist/client';
import { Logger } from '@sqdgn/context-logging/context';
import { RawLiquidityEvent } from './types';
import { Ctx } from '@sqd-pipes/pipes';

export const createTarget = async (client: NodeClickHouseClient, logger: Logger) =>
  createClickhouseTarget({
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
