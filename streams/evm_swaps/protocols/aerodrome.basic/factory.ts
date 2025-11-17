import * as p from '@subsquid/evm-codec';
import { event, fun, viewFun, indexed, ContractBase } from '@subsquid/evm-abi';
import type { EventParams as EParams, FunctionArguments, FunctionReturn } from '@subsquid/evm-abi';

export const events = {
  // Basic Aerodrome Factory
  // example https://basescan.org/address/0x420DD381b31aEf6683db6B902084cB0FFECe40Da#events

  PoolCreated: event(
    '0x2128d88d14c80cb081c1252a5acff7a264671bf199ce226b53788fb26065005e',
    'PoolCreated(address,address,bool,address,uint256)',
    {
      token0: indexed(p.address),
      token1: indexed(p.address),
      stable: indexed(p.bool),
      pool: p.address,
      _4: p.uint256,
    },
  ),
  SetCustomFee: event(
    '0xae468ce586f9a87660fdffc1448cee942042c16ae2f02046b134b5224f31936b',
    'SetCustomFee(address,uint256)',
    { pool: indexed(p.address), fee: p.uint256 },
  ),
  SetFeeManager: event(
    '0x5d0517e3a4eabea892d9750138cd21d4a6cf3b935b43d0598df7055f463819b2',
    'SetFeeManager(address)',
    { feeManager: p.address },
  ),
  SetPauseState: event(
    '0x0d76538efc408318a051137c2720a9e82902acdbd46b802d488b74ca3a09a116',
    'SetPauseState(bool)',
    { state: p.bool },
  ),
  SetPauser: event(
    '0xe02efb9e8f0fc21546730ab32d594f62d586e1bbb15bb5045edd0b1878a77b35',
    'SetPauser(address)',
    { pauser: p.address },
  ),
  SetVoter: event(
    '0xc6ff127433b785c51da9ae4088ee184c909b1a55b9afd82ae6c64224d3bc15d2',
    'SetVoter(address)',
    { voter: p.address },
  ),
};

export const functions = {
  MAX_FEE: viewFun('0xbc063e1a', 'MAX_FEE()', {}, p.uint256),
  ZERO_FEE_INDICATOR: viewFun('0x38c55d46', 'ZERO_FEE_INDICATOR()', {}, p.uint256),
  allPools: viewFun('0x41d1de97', 'allPools(uint256)', { _0: p.uint256 }, p.address),
  allPoolsLength: viewFun('0xefde4e64', 'allPoolsLength()', {}, p.uint256),
  'createPool(address,address,bool)': fun(
    '0x36bf95a0',
    'createPool(address,address,bool)',
    { tokenA: p.address, tokenB: p.address, stable: p.bool },
    p.address,
  ),
  'createPool(address,address,uint24)': fun(
    '0xa1671295',
    'createPool(address,address,uint24)',
    { tokenA: p.address, tokenB: p.address, fee: p.uint24 },
    p.address,
  ),
  customFee: viewFun('0x4d419abc', 'customFee(address)', { _0: p.address }, p.uint256),
  feeManager: viewFun('0xd0fb0203', 'feeManager()', {}, p.address),
  getFee: viewFun(
    '0xcc56b2c5',
    'getFee(address,bool)',
    { pool: p.address, _stable: p.bool },
    p.uint256,
  ),
  'getPool(address,address,uint24)': viewFun(
    '0x1698ee82',
    'getPool(address,address,uint24)',
    { tokenA: p.address, tokenB: p.address, fee: p.uint24 },
    p.address,
  ),
  'getPool(address,address,bool)': viewFun(
    '0x79bc57d5',
    'getPool(address,address,bool)',
    { tokenA: p.address, tokenB: p.address, stable: p.bool },
    p.address,
  ),
  implementation: viewFun('0x5c60da1b', 'implementation()', {}, p.address),
  isPaused: viewFun('0xb187bd26', 'isPaused()', {}, p.bool),
  isPool: viewFun('0x5b16ebb7', 'isPool(address)', { pool: p.address }, p.bool),
  pauser: viewFun('0x9fd0506d', 'pauser()', {}, p.address),
  setCustomFee: fun('0xd49466a8', 'setCustomFee(address,uint256)', {
    pool: p.address,
    fee: p.uint256,
  }),
  setFee: fun('0xe1f76b44', 'setFee(bool,uint256)', { _stable: p.bool, _fee: p.uint256 }),
  setFeeManager: fun('0x472d35b9', 'setFeeManager(address)', { _feeManager: p.address }),
  setPauseState: fun('0xcdb88ad1', 'setPauseState(bool)', { _state: p.bool }),
  setPauser: fun('0x2d88af4a', 'setPauser(address)', { _pauser: p.address }),
  setVoter: fun('0x4bc2a657', 'setVoter(address)', { _voter: p.address }),
  stableFee: viewFun('0x40bbd775', 'stableFee()', {}, p.uint256),
  volatileFee: viewFun('0x5084ed03', 'volatileFee()', {}, p.uint256),
  voter: viewFun('0x46c96aac', 'voter()', {}, p.address),
};

export class Contract extends ContractBase {
  MAX_FEE() {
    return this.eth_call(functions.MAX_FEE, {});
  }

  ZERO_FEE_INDICATOR() {
    return this.eth_call(functions.ZERO_FEE_INDICATOR, {});
  }

  allPools(_0: AllPoolsParams['_0']) {
    return this.eth_call(functions.allPools, { _0 });
  }

  allPoolsLength() {
    return this.eth_call(functions.allPoolsLength, {});
  }

  customFee(_0: CustomFeeParams['_0']) {
    return this.eth_call(functions.customFee, { _0 });
  }

  feeManager() {
    return this.eth_call(functions.feeManager, {});
  }

  getFee(pool: GetFeeParams['pool'], _stable: GetFeeParams['_stable']) {
    return this.eth_call(functions.getFee, { pool, _stable });
  }

  'getPool(address,address,uint24)'(
    tokenA: GetPoolParams_0['tokenA'],
    tokenB: GetPoolParams_0['tokenB'],
    fee: GetPoolParams_0['fee'],
  ) {
    return this.eth_call(functions['getPool(address,address,uint24)'], { tokenA, tokenB, fee });
  }

  'getPool(address,address,bool)'(
    tokenA: GetPoolParams_1['tokenA'],
    tokenB: GetPoolParams_1['tokenB'],
    stable: GetPoolParams_1['stable'],
  ) {
    return this.eth_call(functions['getPool(address,address,bool)'], { tokenA, tokenB, stable });
  }

  implementation() {
    return this.eth_call(functions.implementation, {});
  }

  isPaused() {
    return this.eth_call(functions.isPaused, {});
  }

  isPool(pool: IsPoolParams['pool']) {
    return this.eth_call(functions.isPool, { pool });
  }

  pauser() {
    return this.eth_call(functions.pauser, {});
  }

  stableFee() {
    return this.eth_call(functions.stableFee, {});
  }

  volatileFee() {
    return this.eth_call(functions.volatileFee, {});
  }

  voter() {
    return this.eth_call(functions.voter, {});
  }
}

/// Event types
export type PoolCreatedEventArgs = EParams<typeof events.PoolCreated>;
export type SetCustomFeeEventArgs = EParams<typeof events.SetCustomFee>;
export type SetFeeManagerEventArgs = EParams<typeof events.SetFeeManager>;
export type SetPauseStateEventArgs = EParams<typeof events.SetPauseState>;
export type SetPauserEventArgs = EParams<typeof events.SetPauser>;
export type SetVoterEventArgs = EParams<typeof events.SetVoter>;

/// Function types
export type MAX_FEEParams = FunctionArguments<typeof functions.MAX_FEE>;
export type MAX_FEEReturn = FunctionReturn<typeof functions.MAX_FEE>;

export type ZERO_FEE_INDICATORParams = FunctionArguments<typeof functions.ZERO_FEE_INDICATOR>;
export type ZERO_FEE_INDICATORReturn = FunctionReturn<typeof functions.ZERO_FEE_INDICATOR>;

export type AllPoolsParams = FunctionArguments<typeof functions.allPools>;
export type AllPoolsReturn = FunctionReturn<typeof functions.allPools>;

export type AllPoolsLengthParams = FunctionArguments<typeof functions.allPoolsLength>;
export type AllPoolsLengthReturn = FunctionReturn<typeof functions.allPoolsLength>;

export type CreatePoolParams_0 = FunctionArguments<
  (typeof functions)['createPool(address,address,bool)']
>;
export type CreatePoolReturn_0 = FunctionReturn<
  (typeof functions)['createPool(address,address,bool)']
>;

export type CreatePoolParams_1 = FunctionArguments<
  (typeof functions)['createPool(address,address,uint24)']
>;
export type CreatePoolReturn_1 = FunctionReturn<
  (typeof functions)['createPool(address,address,uint24)']
>;

export type CustomFeeParams = FunctionArguments<typeof functions.customFee>;
export type CustomFeeReturn = FunctionReturn<typeof functions.customFee>;

export type FeeManagerParams = FunctionArguments<typeof functions.feeManager>;
export type FeeManagerReturn = FunctionReturn<typeof functions.feeManager>;

export type GetFeeParams = FunctionArguments<typeof functions.getFee>;
export type GetFeeReturn = FunctionReturn<typeof functions.getFee>;

export type GetPoolParams_0 = FunctionArguments<
  (typeof functions)['getPool(address,address,uint24)']
>;
export type GetPoolReturn_0 = FunctionReturn<(typeof functions)['getPool(address,address,uint24)']>;

export type GetPoolParams_1 = FunctionArguments<
  (typeof functions)['getPool(address,address,bool)']
>;
export type GetPoolReturn_1 = FunctionReturn<(typeof functions)['getPool(address,address,bool)']>;

export type ImplementationParams = FunctionArguments<typeof functions.implementation>;
export type ImplementationReturn = FunctionReturn<typeof functions.implementation>;

export type IsPausedParams = FunctionArguments<typeof functions.isPaused>;
export type IsPausedReturn = FunctionReturn<typeof functions.isPaused>;

export type IsPoolParams = FunctionArguments<typeof functions.isPool>;
export type IsPoolReturn = FunctionReturn<typeof functions.isPool>;

export type PauserParams = FunctionArguments<typeof functions.pauser>;
export type PauserReturn = FunctionReturn<typeof functions.pauser>;

export type SetCustomFeeParams = FunctionArguments<typeof functions.setCustomFee>;
export type SetCustomFeeReturn = FunctionReturn<typeof functions.setCustomFee>;

export type SetFeeParams = FunctionArguments<typeof functions.setFee>;
export type SetFeeReturn = FunctionReturn<typeof functions.setFee>;

export type SetFeeManagerParams = FunctionArguments<typeof functions.setFeeManager>;
export type SetFeeManagerReturn = FunctionReturn<typeof functions.setFeeManager>;

export type SetPauseStateParams = FunctionArguments<typeof functions.setPauseState>;
export type SetPauseStateReturn = FunctionReturn<typeof functions.setPauseState>;

export type SetPauserParams = FunctionArguments<typeof functions.setPauser>;
export type SetPauserReturn = FunctionReturn<typeof functions.setPauser>;

export type SetVoterParams = FunctionArguments<typeof functions.setVoter>;
export type SetVoterReturn = FunctionReturn<typeof functions.setVoter>;

export type StableFeeParams = FunctionArguments<typeof functions.stableFee>;
export type StableFeeReturn = FunctionReturn<typeof functions.stableFee>;

export type VolatileFeeParams = FunctionArguments<typeof functions.volatileFee>;
export type VolatileFeeReturn = FunctionReturn<typeof functions.volatileFee>;

export type VoterParams = FunctionArguments<typeof functions.voter>;
export type VoterReturn = FunctionReturn<typeof functions.voter>;
