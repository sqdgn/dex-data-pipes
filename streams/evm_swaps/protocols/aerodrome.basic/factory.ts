import * as p from '@subsquid/evm-codec';
import { event, fun, viewFun, indexed, ContractBase } from '@subsquid/evm-abi';
import type { EventParams as EParams, FunctionArguments, FunctionReturn } from '@subsquid/evm-abi';

export const events = {
  // Basic Aerodrome
  // https://basescan.org/address/0x420DD381b31aEf6683db6B902084cB0FFECe40Da#events
  PoolCreated: event(
    '0x2128d88d14c80cb081c1252a5acff7a264671bf199ce226b53788fb26065005e',
    'PoolCreated(address,address,bool,address,uint256)',
    {
      token0: indexed(p.address),
      token1: indexed(p.address),
      stable: indexed(p.bool),
      pool: p.address,
      noname: p.uint256,
    },
  ),
};
