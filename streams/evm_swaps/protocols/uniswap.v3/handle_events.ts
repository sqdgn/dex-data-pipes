import { DecodedEvmSwap } from '../../swap_types';
import { events as UniswapV3SwapsEvents } from './swaps';
import { events as UniswapV3FactoryEvents } from './factory';
import { PoolMetadataSimple } from 'streams/evm_swaps/pool_metadata_storage';

export const handleUniswapV3Swap = (log: any): DecodedEvmSwap | null => {
  const data = UniswapV3SwapsEvents.Swap.decode(log);

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

export const handleUniswapV3Pool = (l: any): PoolMetadataSimple | null => {
  if (UniswapV3FactoryEvents.PoolCreated.is(l)) {
    const data = UniswapV3FactoryEvents.PoolCreated.decode(l);
    return {
      pool: data.pool,
      token_a: data.token0,
      token_b: data.token1,
      factory_address: l.address,
      protocol: 'uniswap_v3',
      fee: data.fee,
      tick_spacing: data.tickSpacing,
    };
  }

  return null;
};
