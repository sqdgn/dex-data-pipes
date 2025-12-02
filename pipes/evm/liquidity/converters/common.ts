import { DexProtocol, Network } from 'streams/evm_swaps/networks';
import { DecodedLiqEvent, DbLiquidityEvent, LiqEventType } from '../types';
import assert from 'assert';
import { factoryAddressToDexName } from '../factories';
import { needSwap } from '../../../../streams/evm_swaps/reference_tokens';

export const decodedToDbLiqEvent = (
  e: DecodedLiqEvent,
  type: LiqEventType,
  network: Network,
  protocol: DexProtocol,
): DbLiquidityEvent => {
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
    liquidity: 0n,
    liquidity_delta: 0n,
    sqrt_price_x96: 0n,
    tick_spacing: 0,
    tick: 0,
    tick_lower: 0,
    tick_upper: 0,
    fee: 0,
    event_type: type,
    factory_address: e.factory.contract,
    block_number: e.block.number,
    transaction_index: e.rawEvent.transactionIndex,
    transaction_hash: e.rawEvent.transactionHash,
    log_index: e.rawEvent.logIndex,
    dex_name: factoryAddressToDexName(e.factory.contract, network),
    protocol,
    sign: 1,
  } satisfies DbLiquidityEvent;

  if (type === 'burn' || type === 'collect' || type === 'fees') {
    res.amount_a_raw = -res.amount_a_raw;
    res.amount_b_raw = -res.amount_b_raw;
  }
  return res;
};
