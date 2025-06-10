import { ContractBase, event, fun, indexed, viewFun } from '@subsquid/evm-abi';
import type { EventParams as EParams, FunctionArguments, FunctionReturn } from '@subsquid/evm-abi';
import * as p from '@subsquid/evm-codec';

export const events = {
  Swap: event(
    '0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f',
    'Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)',
    {
      id: indexed(p.bytes32),
      sender: indexed(p.address),
      amount0: p.int128,
      amount1: p.int128,
      sqrtPriceX96: p.uint160,
      liquidity: p.uint128,
      tick: p.int24,
      fee: p.uint24,
    },
  ),
};
