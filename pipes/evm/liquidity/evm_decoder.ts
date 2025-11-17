import { EvmSwapStream } from '../../../streams/evm_swaps/evm_swap_stream';
import { PriceExtendStream } from '../../../streams/evm_swaps/price_extend_stream';
import { createClickhouseClient, ensureTables, toUnixTime } from '../../clickhouse';
import { events as UniswapV2FactoryEvents } from '../../../streams/evm_swaps/protocols/uniswap.v2/factory';
import { events as UniswapV2PairEvents } from '../../../streams/evm_swaps/protocols/uniswap.v2/swaps';
import { events as UniswapV3FactoryEvents } from '../../../streams/evm_swaps/protocols/uniswap.v3/factory';
import { events as UniswapV3PoolEvents } from '../../../streams/evm_swaps/protocols/uniswap.v3/swaps';
import { events as AerodromeBasicPoolEvents } from '../../../streams/evm_swaps/protocols/aerodrome.basic/swaps';
import { events as AerodromeBasicFactoryEvents } from '../../../streams/evm_swaps/protocols/aerodrome.basic/factory';
import { events as AerodromeSlipstreamPoolEvents } from '../../../streams/evm_swaps/protocols/aerodrome.slipstream/swaps';
import { events as AerodromeSlipstreamFactoryEvents } from '../../../streams/evm_swaps/protocols/aerodrome.slipstream/factory';
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
import { FactoryConfigs, getFactoryAddressesByProtocol } from './factories';

const profiler = { id: 'evm-liquidity' };

export const createDecoders = async (
  network: Network,
  poolsDatabasePath: string,
  blockFrom: number,
) => {
  const database = await sqliteFactoryDatabase({ path: poolsDatabasePath });
  const range = { from: blockFrom };

  const v2_addresses = getFactoryAddressesByProtocol(network, 'uniswap_v2');
  const basic_addresses = getFactoryAddressesByProtocol(network, 'aerodrome_basic');
  return {
    // Pool fees are left in a pool and constitite pool TVL
    uniswapV2: createEvmDecoder({
      profiler,
      range,
      contracts: createFactory({
        address: v2_addresses,
        event: UniswapV2FactoryEvents.PairCreated,
        database,
        parameter: 'pair',
      }),
      events: {
        swaps: UniswapV2PairEvents.Swap,
        burns: UniswapV2PairEvents.Burn,
        mints: UniswapV2PairEvents.Mint,
        syncs: UniswapV2PairEvents.Sync,
      },
    }),

    // Pool fees are left in the pool but does not constitute pool TVL
    uniswapV3: createEvmDecoder({
      profiler,
      range: { from: blockFrom },
      contracts: createFactory({
        address: getFactoryAddressesByProtocol(network, 'uniswap_v3'),
        event: UniswapV3FactoryEvents.PoolCreated,
        database,
        parameter: 'pool',
      }),
      events: {
        swaps: UniswapV3PoolEvents.Swap,
        burns: UniswapV3PoolEvents.Burn,
        mints: UniswapV3PoolEvents.Mint,
        collects: UniswapV3PoolEvents.Collect,
      },
    }),

    // Pool fees are left in the pool but does not constitute pool TVL
    aerodromeBasic: createEvmDecoder({
      profiler,
      range,
      contracts: createFactory({
        address: basic_addresses,
        event: AerodromeBasicFactoryEvents.PoolCreated,
        database,
        parameter: 'pool',
      }),
      events: {
        swaps: AerodromeBasicPoolEvents.Swap,
        burns: AerodromeBasicPoolEvents.Burn,
        mints: AerodromeBasicPoolEvents.Mint,
        syncs: AerodromeBasicPoolEvents.Sync,
        fees: AerodromeBasicPoolEvents.Fees,
      },
    }),

    aerodromeSlipstream: createEvmDecoder({
      profiler,
      range,
      contracts: createFactory({
        address: getFactoryAddressesByProtocol(network, 'aerodrome_slipstream'),
        event: AerodromeSlipstreamFactoryEvents.PoolCreated,
        database,
        parameter: 'pool',
      }),
      events: {
        swaps: AerodromeSlipstreamPoolEvents.Swap,
        burns: AerodromeSlipstreamPoolEvents.Burn,
        mints: AerodromeSlipstreamPoolEvents.Mint,
        syncs: AerodromeSlipstreamPoolEvents.Collect,
      },
    }),
  };
};
