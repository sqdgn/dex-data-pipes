import { events as AerodromeBasicSwapEvents } from './swaps';
import { events as AerodromeBasicFactoryEvents } from './factory';
import { DecodedEvmSwap } from 'streams/evm_swaps/swap_types';
import { PoolMetadataSimple } from 'streams/evm_swaps/pool_metadata_storage';

export const handleAerodromeBasicSwap = (log: any): DecodedEvmSwap | null => {
  const data = AerodromeBasicSwapEvents.Swap.decode(log);

  // https://basescan.org/address/0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43#code , router, _swap() function.
  // only one of amount0Out / amount1Out is greater than zero
  return {
    from: {
      amount: data.amount0Out > 0n ? -data.amount0Out : data.amount0In,
      sender: data.sender,
    },
    to: {
      amount: data.amount1Out > 0n ? -data.amount1Out : data.amount1In,
      recipient: data.recipient,
    },
  };
};

export const handleAerodromeBasicPool = (l: any): PoolMetadataSimple | null => {
  if (AerodromeBasicFactoryEvents.PoolCreated.is(l)) {
    const data = AerodromeBasicFactoryEvents.PoolCreated.decode(l);
    return {
      pool: data.pool,
      token_a: data.token0,
      token_b: data.token1,
      factory_address: l.address,
      protocol: 'aerodrome_basic',
      stable: data.stable ? 1 : 0,
    };
  }
  return null;
};
