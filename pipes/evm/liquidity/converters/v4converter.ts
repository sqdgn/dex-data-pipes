import {
  DbLiquidityEvent,
  DecodedLiqEventV4,
  LiqEventType,
  UniswapV3Data,
  UniswapV4Data,
} from '../types';
import { decodedToDbLiqEvent } from './common';
import { DexProtocol, Network } from '../../../../streams/evm_swaps/networks';
import { needSwap } from '../../../../streams/evm_swaps/reference_tokens';
import { PoolMetadataStorage } from 'streams/evm_swaps/pool_metadata_storage';
import { poolManagerToDexName } from '../factories';

export const convertV4 = (
  network: Network,
  { uniswapV4 }: UniswapV4Data,
  poolMetadataStorage: PoolMetadataStorage,
): DbLiquidityEvent[] => {
  const inits = uniswapV4.initializes.map((e) => [e, 'initialize_v4'] as const);
  const modifiesLiquidity = uniswapV4.modifiesLiquidity.map(
    (e) => [e, 'modify_liquidity_v4'] as const,
  );
  const swaps = uniswapV4.swaps.map((e) => [e, 'swap'] as const);

  const v4 = [...inits, ...modifiesLiquidity, ...swaps];
  const res = v4.map((e) => decodedToDbLiqEventV4(e[0], e[1], network, poolMetadataStorage));

  return res.filter((r) => r !== undefined);
};

const decodedToDbLiqEventV4 = (
  e: DecodedLiqEventV4,
  type: 'initialize_v4' | 'modify_liquidity_v4' | 'swap',
  network: Network,
  poolMetadataStorage: PoolMetadataStorage,
): DbLiquidityEvent | undefined => {
  let token_a: string;
  let token_b: string;
  let tick_spacing: number;
  let fee: number;
  const dex_name = poolManagerToDexName(e.rawEvent.address, network);

  if (type === 'initialize_v4') {
    token_a = e.event.currency0!;
    token_b = e.event.currency1!;
    fee = e.event.fee!;
    tick_spacing = e.event.tickSpacing!;

    poolMetadataStorage.savePoolMetadataIntoDb([
      {
        block_number: e.block.number,
        dex_name,
        factory_address: '',
        log_index: e.rawEvent.logIndex,
        network,
        pool: e.event.id,
        protocol: 'uniswap_v4',
        token_a,
        token_b,
        transaction_hash: e.rawEvent.transactionHash,
        transaction_index: e.rawEvent.transactionIndex,
        fee,
        tick_spacing,
      },
    ]);
  } else {
    const pool = poolMetadataStorage.getPoolMetadata(e.event.id);
    if (!pool) {
      return undefined;
    }
    token_a = pool.token_a;
    token_b = pool.token_b;
    fee = pool.fee!;
    tick_spacing = pool.tick_spacing!;
  }

  const a_b_swapped = needSwap(network, token_a, token_b);
  if (a_b_swapped) {
    [token_a, token_b] = [token_b, token_a];
  }

  let amount_a_raw: bigint;
  let amount_b_raw: bigint;
  if (e.event.amount0 !== undefined && e.event.amount1 !== undefined) {
    amount_a_raw = !a_b_swapped ? e.event.amount0 : e.event.amount1;
    amount_b_raw = !a_b_swapped ? e.event.amount1 : e.event.amount0;
  } else {
    amount_a_raw = 0n;
    amount_b_raw = 0n;
  }
  // we invert amounts, as everywhere V3 notation is used
  amount_a_raw = -amount_a_raw;
  amount_b_raw = -amount_b_raw;

  const res = {
    timestamp: Math.floor(e.timestamp.getTime() / 1000),
    pool_address: e.event.id,
    a_b_swapped,
    token_a,
    token_b,
    amount_a_raw,
    amount_b_raw,
    liquidity: e.event.liquidity !== undefined ? e.event.liquidity : 0n,
    liquidity_delta: e.event.liquidityDelta !== undefined ? e.event.liquidityDelta : 0n,
    sqrt_price_x96: e.event.sqrtPriceX96 !== undefined ? e.event.sqrtPriceX96 : 0n,
    tick_spacing,
    tick: e.event.tick !== undefined ? e.event.tick : 0,
    tick_lower: e.event.tickLower !== undefined ? e.event.tickLower : 0,
    tick_upper: e.event.tickUpper !== undefined ? e.event.tickUpper : 0,
    fee,
    event_type: type,
    block_number: e.block.number,
    transaction_index: e.rawEvent.transactionIndex,
    transaction_hash: e.rawEvent.transactionHash,
    log_index: e.rawEvent.logIndex,
    dex_name,
    factory_address: '',
    protocol: 'uniswap_v4',
    sign: 1,
  } satisfies DbLiquidityEvent;

  return res;
};
