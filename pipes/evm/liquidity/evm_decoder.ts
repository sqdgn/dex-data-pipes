import { events as UniswapV2FactoryEvents } from '../../../streams/evm_swaps/protocols/uniswap.v2/factory';
import { events as UniswapV2PairEvents } from '../../../streams/evm_swaps/protocols/uniswap.v2/swaps';
import { events as UniswapV3FactoryEvents } from '../../../streams/evm_swaps/protocols/uniswap.v3/factory';
import { events as UniswapV3PoolEvents } from '../../../streams/evm_swaps/protocols/uniswap.v3/swaps';
import { events as AerodromeBasicPoolEvents } from '../../../streams/evm_swaps/protocols/aerodrome.basic/swaps';
import { events as AerodromeBasicFactoryEvents } from '../../../streams/evm_swaps/protocols/aerodrome.basic/factory';
import { events as AerodromeSlipstreamPoolEvents } from '../../../streams/evm_swaps/protocols/aerodrome.slipstream/swaps';
import { events as AerodromeSlipstreamFactoryEvents } from '../../../streams/evm_swaps/protocols/aerodrome.slipstream/factory';
import { evmDecoder, factory, factorySqliteDatabase } from '@subsquid/pipes/evm';
import { Network } from 'streams/evm_swaps/networks';
import { FactoryConfigs, getFactoryAddressesByProtocol } from './factories';

const profiler = { id: 'evm-liquidity' };

export const createDecoders = async (
  network: Network,
  poolsDatabasePath: string,
  blockFrom: number,
) => {
  const database = await factorySqliteDatabase({ path: poolsDatabasePath });
  const range = { from: blockFrom };

  return {
    // Pool fees are left in a pool and constitite pool TVL
    uniswapV2: evmDecoder({
      profiler,
      range,
      contracts: factory({
        address: getFactoryAddressesByProtocol(network, 'uniswap_v2'),
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
    uniswapV3: evmDecoder({
      profiler,
      range: { from: blockFrom },
      contracts: factory({
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
    aerodromeBasic: evmDecoder({
      profiler,
      range,
      contracts: factory({
        address: getFactoryAddressesByProtocol(network, 'aerodrome_basic'),
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

    aerodromeSlipstream: evmDecoder({
      profiler,
      range,
      contracts: factory({
        address: getFactoryAddressesByProtocol(network, 'aerodrome_slipstream'),
        event: AerodromeSlipstreamFactoryEvents.PoolCreated,
        database,
        parameter: 'pool',
      }),
      events: {
        swaps: AerodromeSlipstreamPoolEvents.Swap,
        burns: AerodromeSlipstreamPoolEvents.Burn,
        mints: AerodromeSlipstreamPoolEvents.Mint,
        collects: AerodromeSlipstreamPoolEvents.Collect,
      },
    }),
  };
};
