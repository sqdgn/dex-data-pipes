import { indexed, event } from '@subsquid/evm-abi';
import * as p from '@subsquid/evm-codec';
import { events as UniswapV3SwapsEvents } from '../uniswap.v3/swaps';

export const events = {
  Swap: UniswapV3SwapsEvents.Swap,
};
