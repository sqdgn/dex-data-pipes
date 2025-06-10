import { BlockRef } from '@sqd-pipes/core';
import { DexName, DexProtocol } from './networks';

export type EvmSwap = {
  dexName: DexName;
  protocol: DexProtocol;
  block: BlockRef;
  account: string;
  sender: string;
  recipient?: string;
  tokenA: {
    amount_raw: bigint;
    amount_human: number;
    address: string;
    symbol?: string;
    decimals?: number;
  };
  tokenB: {
    amount_raw: bigint;
    amount_human: number;
    address: string;
    symbol?: string;
    decimals?: number;
  };
  factory: {
    address: string;
  };
  transaction: {
    hash: string;
    index: number;
    logIndex: number;
  };
  pool: {
    address: string;
    tick_spacing?: number | null;
    fee?: number | null;
    stable?: boolean;
    liquidity?: bigint;
    sqrtPriceX96?: bigint;
    tick?: number;
  };
  timestamp: Date;
};

export type ExtendedEvmSwap = EvmSwap & {
  price_token_a_usdc: number;
  price_token_b_usdc: number;
  a_b_swapped: boolean;
};

export type DecodedEvmSwap = {
  from: {
    amount: bigint;
    sender: string;
  };
  to: {
    amount: bigint;
    recipient?: string;
  };
  liquidity?: bigint;
  tick?: number;
  sqrtPriceX96?: bigint;
  id?: string; // For Uniswap V4 swaps, id of pool
};
