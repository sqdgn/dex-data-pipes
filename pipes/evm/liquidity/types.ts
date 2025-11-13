import { DexName, DexProtocol } from 'streams/evm_swaps/networks';

export type LiqEventType = 'mint' | 'burn' | 'swap';

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
