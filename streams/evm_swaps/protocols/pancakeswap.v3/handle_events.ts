import { DecodedEvmSwap } from '../../swap_types';
import { events as PancakeswapV3SwapsEvents } from './swaps';
import { events as PancakeswapV3FactoryEvents } from './factory';
import { PoolMetadataSimple } from 'streams/evm_swaps/pool_metadata_storage';

export const handlePancakeswapV3Swap = (log: any): DecodedEvmSwap | null => {
  const data = PancakeswapV3SwapsEvents.Swap.decode(log);

  // Compared to UniswapV3 it also includes:
  // data.protocolFeesToken0
  // data.protocolFeesToken1
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

export const handlePancakeswapV3Pool = (l: any): PoolMetadataSimple | null => {
  if (PancakeswapV3FactoryEvents.PoolCreated.is(l)) {
    const data = PancakeswapV3FactoryEvents.PoolCreated.decode(l);
    return {
      pool: data.pool,
      token_a: data.token0,
      token_b: data.token1,
      factory_address: l.address,
      protocol: 'pancakeswap_v3',
      fee: data.fee,
      tick_spacing: data.tickSpacing,
    };
  }

  return null;
};
