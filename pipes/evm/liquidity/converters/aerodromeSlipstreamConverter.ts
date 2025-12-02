import {
  AerodromeBasicData,
  AerodromeSlipstreamData,
  DbLiquidityEvent,
  UniswapV2Data,
} from '../types';
import { decodedToDbLiqEvent } from './common';
import { Network } from '../../../../streams/evm_swaps/networks';

export const convertAerodromeSlipstream = (
  network: Network,
  { aerodromeSlipstream }: AerodromeSlipstreamData,
) => {
  // Aerodrome slipstream
  const slipstream = [
    ...aerodromeSlipstream.burns.map((e) => [e, 'burn'] as const),
    ...aerodromeSlipstream.swaps.map((e) => [e, 'swap'] as const),
    ...aerodromeSlipstream.mints.map((e) => [e, 'mint'] as const),
    ...aerodromeSlipstream.collects.map((e) => [e, 'collect'] as const),
  ];
  const slipstream_res = slipstream.map((e) =>
    decodedToDbLiqEvent(e[0], e[1], network, 'aerodrome_slipstream'),
  );
  return slipstream_res;
};
