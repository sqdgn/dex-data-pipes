import { RawLiquidityEvent, UniswapV2Data } from '../types';
import { rawLiqEventToEvent } from './common';
import { Network } from '../../../../streams/evm_swaps/networks';

export const convertV2 = (network: Network, { uniswapV2 }: UniswapV2Data) => {
  // Uniswap V2
  const v2_swaps = uniswapV2.swaps.map(
    (e) =>
      [
        {
          ...e,
          event: {
            amount0: e.event.amount0In ? e.event.amount0In : -e.event.amount0Out,
            amount1: e.event.amount1In ? e.event.amount1In : -e.event.amount1Out,
          },
        },
        'swap',
      ] as const,
  );

  const v2_syncs = uniswapV2.syncs.map(
    (e) =>
      [
        {
          ...e,
          event: {
            amount0: e.event.reserve0,
            amount1: e.event.reserve1,
          },
        },
        'sync',
      ] as const,
  );

  const v2 = [
    ...uniswapV2.burns.map((e) => [e, 'burn'] as const),
    ...uniswapV2.mints.map((e) => [e, 'mint'] as const),
    ...v2_swaps,
    ...v2_syncs,
  ];
  const v2_res: RawLiquidityEvent[] = v2.map((e) =>
    rawLiqEventToEvent(e[0], e[1], network, 'uniswap_v2'),
  );
  return v2_res;
};
