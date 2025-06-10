import { events as AerodromeSlipstreamSwapEvents } from './swaps';
import { events as AerodromeSlipstreamFactoryEvents } from './factory';
import { PoolMetadata, PoolMetadataSimple } from 'streams/evm_swaps/pool_metadata_storage';
import { DecodedEvmSwap } from 'streams/evm_swaps/swap_types';

export const handleAerodromeSlipstreamSwap = (log: any): DecodedEvmSwap | null => {
  const data = AerodromeSlipstreamSwapEvents.Swap.decode(log);

  return {
    from: {
      amount: data.amount0,
      sender: data.sender,
    },
    to: {
      amount: data.amount1,
      recipient: data.recipient,
    },
    liquidity: data.liquidity,
    sqrtPriceX96: data.sqrtPriceX96,
    tick: data.tick,
  };
};

export const handleAerodromeSlipstreamPool = (l: any): PoolMetadataSimple | null => {
  if (AerodromeSlipstreamFactoryEvents.PoolCreated.is(l)) {
    const data = AerodromeSlipstreamFactoryEvents.PoolCreated.decode(l);
    return {
      pool: data.pool,
      token_a: data.token0,
      token_b: data.token1,
      factory_address: l.address,
      protocol: 'aerodrome_slipstream',
      tick_spacing: data.tickSpacing,
    };
  }
  return null;
};
