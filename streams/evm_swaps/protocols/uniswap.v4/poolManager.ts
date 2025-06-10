import * as p from '@subsquid/evm-codec';
import { event, fun, viewFun, indexed, ContractBase } from '@subsquid/evm-abi';

export const events = {
  Initialize: event(
    '0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438',
    'Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)',
    {
      id: indexed(p.bytes32),
      currency0: indexed(p.address),
      currency1: indexed(p.address),
      fee: p.uint24,
      tickSpacing: p.int24,
      hooks: p.address,
      sqrtPriceX96: p.uint160,
      tick: p.int24,
    },
  ),
};
