import * as p from '@subsquid/evm-codec';
import { event, fun, viewFun, indexed, ContractBase } from '@subsquid/evm-abi';
import type { EventParams as EParams, FunctionArguments, FunctionReturn } from '@subsquid/evm-abi';

export const events = {
  FeeAmountEnabled: event(
    '0xc66a3fdf07232cdd185febcc6579d408c241b47ae2f9907d84be655141eeaecc',
    'FeeAmountEnabled(uint24,int24)',
    { fee: indexed(p.uint24), tickSpacing: indexed(p.int24) },
  ),
  FeeAmountExtraInfoUpdated: event(
    '0xed85b616dbfbc54d0f1180a7bd0f6e3bb645b269b234e7a9edcc269ef1443d88',
    'FeeAmountExtraInfoUpdated(uint24,bool,bool)',
    { fee: indexed(p.uint24), whitelistRequested: p.bool, enabled: p.bool },
  ),
  OwnerChanged: event(
    '0xb532073b38c83145e3e5135377a08bf9aab55bc0fd7c1179cd4fb995d2a5159c',
    'OwnerChanged(address,address)',
    { oldOwner: indexed(p.address), newOwner: indexed(p.address) },
  ),
  PoolCreated: event(
    '0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118',
    'PoolCreated(address,address,uint24,int24,address)',
    {
      token0: indexed(p.address),
      token1: indexed(p.address),
      fee: indexed(p.uint24),
      tickSpacing: p.int24,
      pool: p.address,
    },
  ),
  SetLmPoolDeployer: event(
    '0x4c912280cda47bed324de14f601d3f125a98254671772f3f1f491e50fa0ca407',
    'SetLmPoolDeployer(address)',
    { lmPoolDeployer: indexed(p.address) },
  ),
  WhiteListAdded: event(
    '0xaec42ac7f1bb8651906ae6522f50a19429e124e8ea678ef59fd27750759288a2',
    'WhiteListAdded(address,bool)',
    { user: indexed(p.address), verified: p.bool },
  ),
};

export const functions = {
  collectProtocol: fun(
    '0x43db87da',
    'collectProtocol(address,address,uint128,uint128)',
    {
      pool: p.address,
      recipient: p.address,
      amount0Requested: p.uint128,
      amount1Requested: p.uint128,
    },
    { amount0: p.uint128, amount1: p.uint128 },
  ),
  createPool: fun(
    '0xa1671295',
    'createPool(address,address,uint24)',
    { tokenA: p.address, tokenB: p.address, fee: p.uint24 },
    p.address,
  ),
  enableFeeAmount: fun('0x8a7c195f', 'enableFeeAmount(uint24,int24)', {
    fee: p.uint24,
    tickSpacing: p.int24,
  }),
  feeAmountTickSpacing: viewFun(
    '0x22afcccb',
    'feeAmountTickSpacing(uint24)',
    { _0: p.uint24 },
    p.int24,
  ),
  feeAmountTickSpacingExtraInfo: viewFun(
    '0x88e8006d',
    'feeAmountTickSpacingExtraInfo(uint24)',
    { _0: p.uint24 },
    { whitelistRequested: p.bool, enabled: p.bool },
  ),
  getPool: viewFun(
    '0x1698ee82',
    'getPool(address,address,uint24)',
    { _0: p.address, _1: p.address, _2: p.uint24 },
    p.address,
  ),
  lmPoolDeployer: viewFun('0x5e492ac8', 'lmPoolDeployer()', {}, p.address),
  owner: viewFun('0x8da5cb5b', 'owner()', {}, p.address),
  poolDeployer: viewFun('0x3119049a', 'poolDeployer()', {}, p.address),
  setFeeAmountExtraInfo: fun('0x8ff38e80', 'setFeeAmountExtraInfo(uint24,bool,bool)', {
    fee: p.uint24,
    whitelistRequested: p.bool,
    enabled: p.bool,
  }),
  setFeeProtocol: fun('0x7e8435e6', 'setFeeProtocol(address,uint32,uint32)', {
    pool: p.address,
    feeProtocol0: p.uint32,
    feeProtocol1: p.uint32,
  }),
  setLmPool: fun('0x11ff5e8d', 'setLmPool(address,address)', {
    pool: p.address,
    lmPool: p.address,
  }),
  setLmPoolDeployer: fun('0x80d6a792', 'setLmPoolDeployer(address)', {
    _lmPoolDeployer: p.address,
  }),
  setOwner: fun('0x13af4035', 'setOwner(address)', { _owner: p.address }),
  setWhiteListAddress: fun('0xe4a86a99', 'setWhiteListAddress(address,bool)', {
    user: p.address,
    verified: p.bool,
  }),
};

export class Contract extends ContractBase {
  feeAmountTickSpacing(_0: FeeAmountTickSpacingParams['_0']) {
    return this.eth_call(functions.feeAmountTickSpacing, { _0 });
  }

  feeAmountTickSpacingExtraInfo(_0: FeeAmountTickSpacingExtraInfoParams['_0']) {
    return this.eth_call(functions.feeAmountTickSpacingExtraInfo, { _0 });
  }

  getPool(_0: GetPoolParams['_0'], _1: GetPoolParams['_1'], _2: GetPoolParams['_2']) {
    return this.eth_call(functions.getPool, { _0, _1, _2 });
  }

  lmPoolDeployer() {
    return this.eth_call(functions.lmPoolDeployer, {});
  }

  owner() {
    return this.eth_call(functions.owner, {});
  }

  poolDeployer() {
    return this.eth_call(functions.poolDeployer, {});
  }
}

/// Event types
export type FeeAmountEnabledEventArgs = EParams<typeof events.FeeAmountEnabled>;
export type FeeAmountExtraInfoUpdatedEventArgs = EParams<typeof events.FeeAmountExtraInfoUpdated>;
export type OwnerChangedEventArgs = EParams<typeof events.OwnerChanged>;
export type PoolCreatedEventArgs = EParams<typeof events.PoolCreated>;
export type SetLmPoolDeployerEventArgs = EParams<typeof events.SetLmPoolDeployer>;
export type WhiteListAddedEventArgs = EParams<typeof events.WhiteListAdded>;

/// Function types
export type CollectProtocolParams = FunctionArguments<typeof functions.collectProtocol>;
export type CollectProtocolReturn = FunctionReturn<typeof functions.collectProtocol>;

export type CreatePoolParams = FunctionArguments<typeof functions.createPool>;
export type CreatePoolReturn = FunctionReturn<typeof functions.createPool>;

export type EnableFeeAmountParams = FunctionArguments<typeof functions.enableFeeAmount>;
export type EnableFeeAmountReturn = FunctionReturn<typeof functions.enableFeeAmount>;

export type FeeAmountTickSpacingParams = FunctionArguments<typeof functions.feeAmountTickSpacing>;
export type FeeAmountTickSpacingReturn = FunctionReturn<typeof functions.feeAmountTickSpacing>;

export type FeeAmountTickSpacingExtraInfoParams = FunctionArguments<
  typeof functions.feeAmountTickSpacingExtraInfo
>;
export type FeeAmountTickSpacingExtraInfoReturn = FunctionReturn<
  typeof functions.feeAmountTickSpacingExtraInfo
>;

export type GetPoolParams = FunctionArguments<typeof functions.getPool>;
export type GetPoolReturn = FunctionReturn<typeof functions.getPool>;

export type LmPoolDeployerParams = FunctionArguments<typeof functions.lmPoolDeployer>;
export type LmPoolDeployerReturn = FunctionReturn<typeof functions.lmPoolDeployer>;

export type OwnerParams = FunctionArguments<typeof functions.owner>;
export type OwnerReturn = FunctionReturn<typeof functions.owner>;

export type PoolDeployerParams = FunctionArguments<typeof functions.poolDeployer>;
export type PoolDeployerReturn = FunctionReturn<typeof functions.poolDeployer>;

export type SetFeeAmountExtraInfoParams = FunctionArguments<typeof functions.setFeeAmountExtraInfo>;
export type SetFeeAmountExtraInfoReturn = FunctionReturn<typeof functions.setFeeAmountExtraInfo>;

export type SetFeeProtocolParams = FunctionArguments<typeof functions.setFeeProtocol>;
export type SetFeeProtocolReturn = FunctionReturn<typeof functions.setFeeProtocol>;

export type SetLmPoolParams = FunctionArguments<typeof functions.setLmPool>;
export type SetLmPoolReturn = FunctionReturn<typeof functions.setLmPool>;

export type SetLmPoolDeployerParams = FunctionArguments<typeof functions.setLmPoolDeployer>;
export type SetLmPoolDeployerReturn = FunctionReturn<typeof functions.setLmPoolDeployer>;

export type SetOwnerParams = FunctionArguments<typeof functions.setOwner>;
export type SetOwnerReturn = FunctionReturn<typeof functions.setOwner>;

export type SetWhiteListAddressParams = FunctionArguments<typeof functions.setWhiteListAddress>;
export type SetWhiteListAddressReturn = FunctionReturn<typeof functions.setWhiteListAddress>;
