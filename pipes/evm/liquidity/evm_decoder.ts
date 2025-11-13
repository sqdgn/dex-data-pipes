import { EvmSwapStream } from '../../../streams/evm_swaps/evm_swap_stream';
import { PriceExtendStream } from '../../../streams/evm_swaps/price_extend_stream';
import { createClickhouseClient, ensureTables, toUnixTime } from '../../clickhouse';
import { events as UniswapV2FactoryEvents } from '../../../streams/evm_swaps/protocols/uniswap.v2/factory';
import { events as UniswapV2PoolEvents } from '../../../streams/evm_swaps/protocols/uniswap.v2/swaps';
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
import { Network } from 'streams/evm_swaps/networks';
import { FactoryConfigs } from './factories';

export const createV2Decoder = async (
  network: Network,
  poolsDatabasePath: string,
  blockFrom: number,
) =>
  createEvmDecoder({
    profiler: { id: 'evm-liquidity' },
    range: { from: blockFrom },
    contracts: createFactory({
      address: FactoryConfigs[network]?.uniswap?.uniswap_v2?.address!,
      event: UniswapV2FactoryEvents.PairCreated,
      database: await sqliteFactoryDatabase({ path: poolsDatabasePath }),
      parameter: 'pair',
    }),
    events: {
      swaps: UniswapV2PoolEvents.Swap,
      burns: UniswapV2PoolEvents.Burn,
      mints: UniswapV2PoolEvents.Mint,
    },
  });

export const createV3Decoder = async (
  network: Network,
  poolsDatabasePath: string,
  blockFrom: number,
) =>
  createEvmDecoder({
    profiler: { id: 'evm-liquidity' },
    range: { from: blockFrom },
    contracts: createFactory({
      address: FactoryConfigs[network]?.uniswap?.uniswap_v3?.address!,
      event: UniswapV3FactoryEvents.PoolCreated,
      database: await sqliteFactoryDatabase({ path: poolsDatabasePath }),
      parameter: 'pool',
    }),
    events: {
      swaps: UniswapV3PoolEvents.Swap,
      burns: UniswapV3PoolEvents.Burn,
      mints: UniswapV3PoolEvents.Mint,
    },
  });
