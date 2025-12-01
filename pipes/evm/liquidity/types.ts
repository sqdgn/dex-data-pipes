import { DexName, DexProtocol } from 'streams/evm_swaps/networks';
import { createDecoders } from './evm_decoder';
import { CompositePipe } from '@subsquid/pipes';
import { FactoryEvent } from '@subsquid/pipes/evm';
import { LogFields } from 'node_modules/@subsquid/pipes/dist/portal-client/query/evm';

export type LiqEventType = 'mint' | 'burn' | 'swap' | 'collect' | 'sync' | 'fees';

export type RawLiquidityEvent = {
  timestamp: number;
  pool_address: string;
  event_type: LiqEventType;
  token_a: string;
  token_b: string;
  amount_a_raw: bigint;
  amount_b_raw: bigint;
  factory_address: string;
  dex_name: DexName;
  protocol: DexProtocol;
  block_number: number;
  transaction_index: number;
  log_index: number;
  transaction_hash: string;
  a_b_swapped: boolean;
  sign: number;
};

export type LiqEvent = {
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

export type UniswapV2ReturnType = Awaited<ReturnType<typeof createDecoders>>['uniswapV2'];
export type UniswapV3ReturnType = Awaited<ReturnType<typeof createDecoders>>['uniswapV3'];
export type UniswapV4ReturnType = Awaited<ReturnType<typeof createDecoders>>['uniswapV4'];
export type AerodromeBasicReturnType = Awaited<ReturnType<typeof createDecoders>>['aerodromeBasic'];
export type AerodromeSlipstreamReturnType = Awaited<
  ReturnType<typeof createDecoders>
>['aerodromeSlipstream'];

export type InputType = CompositePipe<{
  uniswapV2: UniswapV2ReturnType;
  uniswapV3: UniswapV3ReturnType;
  uniswapV4: UniswapV4ReturnType;
  aerodromeBasic: AerodromeBasicReturnType;
  aerodromeSlipstream: AerodromeSlipstreamReturnType;
}>;

export type UniswapV2Data = Pick<InputType, 'uniswapV2'>;
export type UniswapV3Data = Pick<InputType, 'uniswapV3'>;
export type UniswapV4Data = Pick<InputType, 'uniswapV4'>;
export type AerodromeBasicData = Pick<InputType, 'aerodromeBasic'>;
export type AerodromeSlipstreamData = Pick<InputType, 'aerodromeSlipstream'>;
