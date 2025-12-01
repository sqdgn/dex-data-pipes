import { RawLiquidityEvent, UniswapV3Data } from '../types';
import { rawLiqEventToEvent } from './common';
import { Network } from '../../../../streams/evm_swaps/networks';

export const convertV3 = (network: Network, { uniswapV3 }: UniswapV3Data) => {
  // Uniswap V3
  const v3 = [
    ...uniswapV3.burns.map((e) => [e, 'burn'] as const),
    ...uniswapV3.collects.map((e) => [e, 'collect'] as const),
    ...uniswapV3.mints.map((e) => [e, 'mint'] as const),
    ...uniswapV3.swaps.map((e) => [e, 'swap'] as const),
  ].filter((e) => e[0].event.amount0 || e[0].event.amount1);

  const v3_res: RawLiquidityEvent[] = v3.map((e) =>
    rawLiqEventToEvent(e[0], e[1], network, 'uniswap_v3'),
  );
  return v3_res;
};
