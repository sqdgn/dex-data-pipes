import { AerodromeBasicData, DbLiquidityEvent, UniswapV2Data } from '../types';
import { decodedToDbLiqEvent } from './common';
import { Network } from '../../../../streams/evm_swaps/networks';

export const convertAerodromeBasic = (network: Network, { aerodromeBasic }: AerodromeBasicData) => {
  // Aerodrome Basic
  const basic_swaps = aerodromeBasic.swaps.map(
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

  const basic_syncs = aerodromeBasic.syncs.map(
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
  const basic = [
    ...aerodromeBasic.burns.map((e) => [e, 'burn'] as const),
    ...aerodromeBasic.fees.map((e) => [e, 'fees'] as const),
    ...aerodromeBasic.mints.map((e) => [e, 'mint'] as const),
    ...basic_swaps,
    ...basic_syncs,
  ];
  const basic_res = basic.map((e) => decodedToDbLiqEvent(e[0], e[1], network, 'aerodrome_basic'));
  return basic_res;
};
