import { CompositePipe } from 'node_modules/@sqd-pipes/pipes/dist/core/composite-transformer';
import { createV2Decoder, createV3Decoder } from './evm_decoder';
import { LiqEventType, RawLiquidityEvent } from './types';
import { token } from 'streams/solana/swaps-stream/handlers';
import assert from 'assert';
import { FactoryEvent } from '@sqd-pipes/pipes/evm';
import { needSwap } from '../../../streams/evm_swaps/reference_tokens';
import { LogFields } from 'node_modules/@sqd-pipes/pipes/dist/portal-client/query/evm';
import { DexName, DexProtocol, Network } from 'streams/evm_swaps/networks';
import { factoryAddressToDexName } from './factories';

type UniswapV2ReturnType = Awaited<ReturnType<typeof createV2Decoder>>;
type UniswapV3ReturnType = Awaited<ReturnType<typeof createV3Decoder>>;

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
    //dex_name: factoryAddressToDexName(e.factory.contract, network),
    dex_name: 'uniswap',
    protocol,
    sign: 1,
  } satisfies RawLiquidityEvent;

  if (type === 'burn') {
    res.amount_a_raw = -res.amount_a_raw;
    res.amount_b_raw = -res.amount_b_raw;
  }
  return res;
};

type InputType = CompositePipe<{
  uniswapV2: UniswapV2ReturnType;
  uniswapV3: UniswapV3ReturnType;
}>;

export const createPipeFunc = (network: Network) => {
  return ({ uniswapV2, uniswapV3 }: InputType) => {
    const s = uniswapV2.swaps.map(
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

    const v2 = [
      ...uniswapV2.burns.map((e) => [e, 'burn'] as const),
      ...uniswapV2.mints.map((e) => [e, 'mint'] as const),
      ...s,
    ];
    const v2_res: RawLiquidityEvent[] = v2.map((e) => {
      return rawLiqEventToEvent(e[0], e[1], network, 'uniswap_v2');
    });

    const v3 = [
      ...uniswapV3.burns.map((e) => [e, 'burn'] as const),
      ...uniswapV3.mints.map((e) => [e, 'mint'] as const),
      ...uniswapV3.swaps.map((e) => [e, 'swap'] as const),
    ].filter((e) => e[0].event.amount0 || e[0].event.amount1);

    const v3_res: RawLiquidityEvent[] = v3.map((e) => {
      return rawLiqEventToEvent(e[0], e[1], network, 'uniswap_v3');
    });

    return [...v2_res, ...v3_res];
  };
};
