import { ClickhouseState } from '@sqd-pipes/core';
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

export const createPortalSource = async (portal: string, portalCacheDbPath: string) =>
  createEvmPortalSource({
    portal,
    metrics: createNodeMetricsServer({
      port: 8888,
    }),
    cache: {
      adapter: await sqliteCacheAdapter({
        path: portalCacheDbPath,
      }),
    },
  });
