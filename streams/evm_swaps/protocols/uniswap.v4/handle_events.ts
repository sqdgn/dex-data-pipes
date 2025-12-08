import { DecodedEvmSwap } from '../../swap_types';
import { events as UniswapV4PoolManagerEvents } from './poolManager';
import { PoolMetadataSimple } from 'streams/evm_swaps/pool_metadata_storage';

export const handleUniswapV4Swap = (log: any): DecodedEvmSwap | null => {
  const data = UniswapV4PoolManagerEvents.Swap.decode(log);

  return {
    from: {
      amount: -data.amount0, // negation for both amounts as Uniswap V4 uses reverse notation,
      // in stream here we use Uniswap V3 (pool-related) notation (negative value – user withdraws token, positive – user deposits
      // token into a pool)
      sender: data.sender,
    },
    to: {
      amount: -data.amount1,
    },
    liquidity: data.liquidity,
    sqrtPriceX96: data.sqrtPriceX96,
    tick: data.tick,
    id: data.id,
  };
};

export const handleUniswapV4Pool = (l: any): PoolMetadataSimple | null => {
  if (UniswapV4PoolManagerEvents.Initialize.is(l)) {
    const data = UniswapV4PoolManagerEvents.Initialize.decode(l);
    return {
      pool: data.id,
      token_a: data.currency0,
      token_b: data.currency1,
      factory_address: l.address,
      protocol: 'uniswap_v4',
      fee: data.fee,
      tick_spacing: data.tickSpacing,
    };
  }

  return null;
};
