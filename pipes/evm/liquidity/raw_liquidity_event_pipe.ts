import { CompositePipe } from 'node_modules/@sqd-pipes/pipes/dist/core/composite-transformer';
import { LiqEventType, RawLiquidityEvent } from './types';
import { token } from 'streams/solana/swaps-stream/handlers';
import assert from 'assert';
import { FactoryEvent } from '@sqd-pipes/pipes/evm';
import { needSwap } from '../../../streams/evm_swaps/reference_tokens';
import { LogFields } from 'node_modules/@sqd-pipes/pipes/dist/portal-client/query/evm';
import { DexName, DexProtocol, Network } from 'streams/evm_swaps/networks';
import { factoryAddressToDexName } from './factories';
import { createDecoders } from './evm_decoder';

type UniswapV2ReturnType = Awaited<ReturnType<typeof createDecoders>>['uniswapV2'];
type UniswapV3ReturnType = Awaited<ReturnType<typeof createDecoders>>['uniswapV3'];
type AerodromeBasicReturnType = Awaited<ReturnType<typeof createDecoders>>['aerodromeBasic'];
type AerodromeSlipstreamReturnType = Awaited<
  ReturnType<typeof createDecoders>
>['aerodromeSlipstream'];

type InputType = CompositePipe<{
  uniswapV2: UniswapV2ReturnType;
  uniswapV3: UniswapV3ReturnType;
  aerodromeBasic: AerodromeBasicReturnType;
  aerodromeSlipstream: AerodromeSlipstreamReturnType;
}>;

type LiqEvent = {
  contract: string;
  timestamp: Date;
  event: {
    readonly amount0: bigint;
    readonly amount1: bigint;
  };
  factory?:
    | FactoryEvent<{
        readonly token0: string;
        readonly token1: string;
      }>
    | undefined;
  rawEvent: LogFields;
  block: {
    number: number;
  };
};

const rawLiqEventToEvent = (
  e: LiqEvent,
  type: LiqEventType,
  network: Network,
  protocol: DexProtocol,
): RawLiquidityEvent => {
  assert(e.factory);
  const a_b_swapped = needSwap(network, e.factory.event.token0, e.factory.event.token1);
  const res = {
    timestamp: Math.floor(e.timestamp.getTime() / 1000),
    pool_address: e.contract,
    a_b_swapped,
    token_a: !a_b_swapped ? e.factory.event.token0 : e.factory.event.token1,
    token_b: !a_b_swapped ? e.factory.event.token1 : e.factory.event.token0,
    amount_a_raw: !a_b_swapped ? e.event.amount0 : e.event.amount1,
    amount_b_raw: !a_b_swapped ? e.event.amount1 : e.event.amount0,
    event_type: type,
    factory_address: e.factory.contract,
    block_number: e.block.number,
    transaction_index: e.rawEvent.transactionIndex,
    transaction_hash: e.rawEvent.transactionHash,
    log_index: e.rawEvent.logIndex,
    dex_name: factoryAddressToDexName(e.factory.contract, network),
    protocol,
    sign: 1,
  } satisfies RawLiquidityEvent;

  if (type === 'burn' || type === 'collect' || type === 'fees') {
    res.amount_a_raw = -res.amount_a_raw;
    res.amount_b_raw = -res.amount_b_raw;
  }
  return res;
};

export const createPipeFunc = (network: Network) => {
  return ({ uniswapV2, uniswapV3, aerodromeBasic, aerodromeSlipstream }: InputType) => {
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
              amount1: e.event.reserve0,
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
    const basic = [
      ...aerodromeBasic.burns.map((e) => [e, 'burn'] as const),
      ...aerodromeBasic.fees.map((e) => [e, 'fees'] as const),
      ...aerodromeBasic.mints.map((e) => [e, 'mint'] as const),
      ...basic_swaps,
    ];
    const basic_res = basic.map((e) => rawLiqEventToEvent(e[0], e[1], network, 'aerodrome_basic'));

    // Aerodrome slipstream
    const slipstream = [
      ...aerodromeSlipstream.burns.map((e) => [e, 'burn'] as const),
      ...aerodromeSlipstream.swaps.map((e) => [e, 'swap'] as const),
      ...aerodromeSlipstream.mints.map((e) => [e, 'mint'] as const),
      ...aerodromeSlipstream.syncs.map((e) => [e, 'sync'] as const),
    ];
    const slipstream_res = slipstream.map((e) =>
      rawLiqEventToEvent(e[0], e[1], network, 'aerodrome_slipstream'),
    );

    return [...v2_res, ...v3_res, ...basic_res, ...slipstream_res];
  };
};
