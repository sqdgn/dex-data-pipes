import { DecodedEvmSwap } from '../../swap_types';
import { events as UniswapV2SwapsEvents } from './swaps';
import { events as UniswapV2FactoryEvents } from './factory';
import { PoolMetadata, PoolMetadataSimple } from '../../pool_metadata_storage';

export const handleUniswapV2Swap = (log: any): DecodedEvmSwap | null => {
  const data = UniswapV2SwapsEvents.Swap.decode(log);

  return {
    from: {
      amount: data.amount0Out > 0n ? -data.amount0Out : data.amount0In,
      sender: data.sender,
    },
    to: {
      amount: data.amount1Out > 0n ? -data.amount1Out : data.amount1In,
      recipient: data.to,
    },
  };
};

export const handleUniswapV2Pool = (l: any): PoolMetadataSimple | null => {
  if (UniswapV2FactoryEvents.PairCreated.is(l)) {
    const data = UniswapV2FactoryEvents.PairCreated.decode(l);
    return {
      pool: data.pair,
      token_a: data.token0,
      token_b: data.token1,
      factory_address: l.address,
      protocol: 'uniswap_v2',
    };
  }

  return null;
};
