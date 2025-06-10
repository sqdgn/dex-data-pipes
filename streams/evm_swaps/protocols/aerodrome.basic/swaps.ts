import { indexed, event } from '@subsquid/evm-abi';
import * as p from '@subsquid/evm-codec';
export const events = {
  Swap: event(
    '0xb3e2773606abfd36b5bd91394b3a54d1398336c65005baf7bf7a05efeffaf75b',
    'Swap(address,address,uint256,uint256,uint256,uint256)',
    {
      sender: indexed(p.address),
      recipient: indexed(p.address),
      amount0In: p.uint256,
      amount1In: p.uint256,
      amount0Out: p.uint256,
      amount1Out: p.uint256,
    },
  ),
};
