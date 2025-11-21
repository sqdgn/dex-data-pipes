// Aerodrome Slipstream (CL) pool
// example – https://basescan.org/address/0x61c6e9e93592e535efc1bee07f491a517e98f6d0#code
import * as p from '@subsquid/evm-codec';
import { event, fun, viewFun, indexed, ContractBase } from '@subsquid/evm-abi';
import type { EventParams as EParams, FunctionArguments, FunctionReturn } from '@subsquid/evm-abi';

export const events = {
  Burn: event(
    '0x0c396cd989a39f4459b5fa1aed6a9a8dcdbc45908acfd67e028cd568da98982c',
    'Burn(address,int24,int24,uint128,uint256,uint256)',
    {
      owner: indexed(p.address),
      tickLower: indexed(p.int24),
      tickUpper: indexed(p.int24),
      amount: p.uint128,
      amount0: p.uint256,
      amount1: p.uint256,
    },
  ),
  Collect: event(
    '0x70935338e69775456a85ddef226c395fb668b63fa0115f5f20610b388e6ca9c0',
    'Collect(address,address,int24,int24,uint128,uint128)',
    {
      owner: indexed(p.address),
      recipient: p.address,
      tickLower: indexed(p.int24),
      tickUpper: indexed(p.int24),
      amount0: p.uint128,
      amount1: p.uint128,
    },
  ),
  CollectFees: event(
    '0x205860e66845f2bbc0966bfab80db9bf93fca93862ea2b9fcf6945748352b4a3',
    'CollectFees(address,uint128,uint128)',
    { recipient: indexed(p.address), amount0: p.uint128, amount1: p.uint128 },
  ),
  Flash: event(
    '0xbdbdb71d7860376ba52b25a5028beea23581364a40522f6bcfb86bb1f2dca633',
    'Flash(address,address,uint256,uint256,uint256,uint256)',
    {
      sender: indexed(p.address),
      recipient: indexed(p.address),
      amount0: p.uint256,
      amount1: p.uint256,
      paid0: p.uint256,
      paid1: p.uint256,
    },
  ),
  IncreaseObservationCardinalityNext: event(
    '0xac49e518f90a358f652e4400164f05a5d8f7e35e7747279bc3a93dbf584e125a',
    'IncreaseObservationCardinalityNext(uint16,uint16)',
    { observationCardinalityNextOld: p.uint16, observationCardinalityNextNew: p.uint16 },
  ),
  Initialize: event(
    '0x98636036cb66a9c19a37435efc1e90142190214e8abeb821bdba3f2990dd4c95',
    'Initialize(uint160,int24)',
    { sqrtPriceX96: p.uint160, tick: p.int24 },
  ),
  Mint: event(
    '0x7a53080ba414158be7ec69b987b5fb7d07dee101fe85488f0853ae16239d0bde',
    'Mint(address,address,int24,int24,uint128,uint256,uint256)',
    {
      sender: p.address,
      owner: indexed(p.address),
      tickLower: indexed(p.int24),
      tickUpper: indexed(p.int24),
      amount: p.uint128,
      amount0: p.uint256,
      amount1: p.uint256,
    },
  ),
  SetFeeProtocol: event(
    '0x973d8d92bb299f4af6ce49b52a8adb85ae46b9f214c4c4fc06ac77401237b133',
    'SetFeeProtocol(uint8,uint8,uint8,uint8)',
    {
      feeProtocol0Old: p.uint8,
      feeProtocol1Old: p.uint8,
      feeProtocol0New: p.uint8,
      feeProtocol1New: p.uint8,
    },
  ),
  Swap: event(
    '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67',
    'Swap(address,address,int256,int256,uint160,uint128,int24)',
    {
      sender: indexed(p.address),
      recipient: indexed(p.address),
      amount0: p.int256,
      amount1: p.int256,
      sqrtPriceX96: p.uint160,
      liquidity: p.uint128,
      tick: p.int24,
    },
  ),
};

export const functions = {
  'burn(int24,int24,uint128,address)': fun(
    '0x6f89244c',
    'burn(int24,int24,uint128,address)',
    { tickLower: p.int24, tickUpper: p.int24, amount: p.uint128, owner: p.address },
    { amount0: p.uint256, amount1: p.uint256 },
  ),
  'burn(int24,int24,uint128)': fun(
    '0xa34123a7',
    'burn(int24,int24,uint128)',
    { tickLower: p.int24, tickUpper: p.int24, amount: p.uint128 },
    { amount0: p.uint256, amount1: p.uint256 },
  ),
  'collect(address,int24,int24,uint128,uint128,address)': fun(
    '0x31338374',
    'collect(address,int24,int24,uint128,uint128,address)',
    {
      recipient: p.address,
      tickLower: p.int24,
      tickUpper: p.int24,
      amount0Requested: p.uint128,
      amount1Requested: p.uint128,
      owner: p.address,
    },
    { amount0: p.uint128, amount1: p.uint128 },
  ),
  'collect(address,int24,int24,uint128,uint128)': fun(
    '0x4f1eb3d8',
    'collect(address,int24,int24,uint128,uint128)',
    {
      recipient: p.address,
      tickLower: p.int24,
      tickUpper: p.int24,
      amount0Requested: p.uint128,
      amount1Requested: p.uint128,
    },
    { amount0: p.uint128, amount1: p.uint128 },
  ),
  collectFees: fun('0xc8796572', 'collectFees()', {}, { amount0: p.uint128, amount1: p.uint128 }),
  factory: viewFun('0xc45a0155', 'factory()', {}, p.address),
  factoryRegistry: viewFun('0x3bf0c9fb', 'factoryRegistry()', {}, p.address),
  fee: viewFun('0xddca3f43', 'fee()', {}, p.uint24),
  feeGrowthGlobal0X128: viewFun('0xf3058399', 'feeGrowthGlobal0X128()', {}, p.uint256),
  feeGrowthGlobal1X128: viewFun('0x46141319', 'feeGrowthGlobal1X128()', {}, p.uint256),
  flash: fun('0x490e6cbc', 'flash(address,uint256,uint256,bytes)', {
    recipient: p.address,
    amount0: p.uint256,
    amount1: p.uint256,
    data: p.bytes,
  }),
  gauge: viewFun('0xa6f19c84', 'gauge()', {}, p.address),
  gaugeFees: viewFun('0x293833ba', 'gaugeFees()', {}, { token0: p.uint128, token1: p.uint128 }),
  getRewardGrowthInside: viewFun(
    '0xa16368c9',
    'getRewardGrowthInside(int24,int24,uint256)',
    { tickLower: p.int24, tickUpper: p.int24, _rewardGrowthGlobalX128: p.uint256 },
    p.uint256,
  ),
  increaseObservationCardinalityNext: fun(
    '0x32148f67',
    'increaseObservationCardinalityNext(uint16)',
    { observationCardinalityNext: p.uint16 },
  ),
  initialize: fun('0x2071d884', 'initialize(address,address,address,int24,address,uint160)', {
    _factory: p.address,
    _token0: p.address,
    _token1: p.address,
    _tickSpacing: p.int24,
    _factoryRegistry: p.address,
    _sqrtPriceX96: p.uint160,
  }),
  lastUpdated: viewFun('0xd0b06f5d', 'lastUpdated()', {}, p.uint32),
  liquidity: viewFun('0x1a686502', 'liquidity()', {}, p.uint128),
  maxLiquidityPerTick: viewFun('0x70cf754a', 'maxLiquidityPerTick()', {}, p.uint128),
  mint: fun(
    '0x3c8a7d8d',
    'mint(address,int24,int24,uint128,bytes)',
    {
      recipient: p.address,
      tickLower: p.int24,
      tickUpper: p.int24,
      amount: p.uint128,
      data: p.bytes,
    },
    { amount0: p.uint256, amount1: p.uint256 },
  ),
  nft: viewFun('0x47ccca02', 'nft()', {}, p.address),
  observations: viewFun(
    '0x252c09d7',
    'observations(uint256)',
    { _0: p.uint256 },
    {
      blockTimestamp: p.uint32,
      tickCumulative: p.int56,
      secondsPerLiquidityCumulativeX128: p.uint160,
      initialized: p.bool,
    },
  ),
  observe: viewFun(
    '0x883bdbfd',
    'observe(uint32[])',
    { secondsAgos: p.array(p.uint32) },
    { tickCumulatives: p.array(p.int56), secondsPerLiquidityCumulativeX128s: p.array(p.uint160) },
  ),
  periodFinish: viewFun('0xebe2b12b', 'periodFinish()', {}, p.uint256),
  positions: viewFun(
    '0x514ea4bf',
    'positions(bytes32)',
    { _0: p.bytes32 },
    {
      liquidity: p.uint128,
      feeGrowthInside0LastX128: p.uint256,
      feeGrowthInside1LastX128: p.uint256,
      tokensOwed0: p.uint128,
      tokensOwed1: p.uint128,
    },
  ),
  rewardGrowthGlobalX128: viewFun('0x57806ada', 'rewardGrowthGlobalX128()', {}, p.uint256),
  rewardRate: viewFun('0x7b0a47ee', 'rewardRate()', {}, p.uint256),
  rewardReserve: viewFun('0xcab64bcd', 'rewardReserve()', {}, p.uint256),
  rollover: viewFun('0xb056b49a', 'rollover()', {}, p.uint256),
  setGaugeAndPositionManager: fun('0x1f7c3568', 'setGaugeAndPositionManager(address,address)', {
    _gauge: p.address,
    _nft: p.address,
  }),
  slot0: viewFun(
    '0x3850c7bd',
    'slot0()',
    {},
    {
      sqrtPriceX96: p.uint160,
      tick: p.int24,
      observationIndex: p.uint16,
      observationCardinality: p.uint16,
      observationCardinalityNext: p.uint16,
      unlocked: p.bool,
    },
  ),
  snapshotCumulativesInside: viewFun(
    '0xa38807f2',
    'snapshotCumulativesInside(int24,int24)',
    { tickLower: p.int24, tickUpper: p.int24 },
    {
      tickCumulativeInside: p.int56,
      secondsPerLiquidityInsideX128: p.uint160,
      secondsInside: p.uint32,
    },
  ),
  stake: fun('0x4ed6210f', 'stake(int128,int24,int24,bool)', {
    stakedLiquidityDelta: p.int128,
    tickLower: p.int24,
    tickUpper: p.int24,
    positionUpdate: p.bool,
  }),
  stakedLiquidity: viewFun('0x3ab04b20', 'stakedLiquidity()', {}, p.uint128),
  swap: fun(
    '0x128acb08',
    'swap(address,bool,int256,uint160,bytes)',
    {
      recipient: p.address,
      zeroForOne: p.bool,
      amountSpecified: p.int256,
      sqrtPriceLimitX96: p.uint160,
      data: p.bytes,
    },
    { amount0: p.int256, amount1: p.int256 },
  ),
  syncReward: fun('0x60a73f9b', 'syncReward(uint256,uint256,uint256)', {
    _rewardRate: p.uint256,
    _rewardReserve: p.uint256,
    _periodFinish: p.uint256,
  }),
  tickBitmap: viewFun('0x5339c296', 'tickBitmap(int16)', { _0: p.int16 }, p.uint256),
  tickSpacing: viewFun('0xd0c93a7c', 'tickSpacing()', {}, p.int24),
  ticks: viewFun(
    '0xf30dba93',
    'ticks(int24)',
    { _0: p.int24 },
    {
      liquidityGross: p.uint128,
      liquidityNet: p.int128,
      stakedLiquidityNet: p.int128,
      feeGrowthOutside0X128: p.uint256,
      feeGrowthOutside1X128: p.uint256,
      rewardGrowthOutsideX128: p.uint256,
      tickCumulativeOutside: p.int56,
      secondsPerLiquidityOutsideX128: p.uint160,
      secondsOutside: p.uint32,
      initialized: p.bool,
    },
  ),
  token0: viewFun('0x0dfe1681', 'token0()', {}, p.address),
  token1: viewFun('0xd21220a7', 'token1()', {}, p.address),
  unstakedFee: viewFun('0xb64cc67b', 'unstakedFee()', {}, p.uint24),
  updateRewardsGrowthGlobal: fun('0x1b410960', 'updateRewardsGrowthGlobal()', {}),
};

export class Contract extends ContractBase {
  factory() {
    return this.eth_call(functions.factory, {});
  }

  factoryRegistry() {
    return this.eth_call(functions.factoryRegistry, {});
  }

  fee() {
    return this.eth_call(functions.fee, {});
  }

  feeGrowthGlobal0X128() {
    return this.eth_call(functions.feeGrowthGlobal0X128, {});
  }

  feeGrowthGlobal1X128() {
    return this.eth_call(functions.feeGrowthGlobal1X128, {});
  }

  gauge() {
    return this.eth_call(functions.gauge, {});
  }

  gaugeFees() {
    return this.eth_call(functions.gaugeFees, {});
  }

  getRewardGrowthInside(
    tickLower: GetRewardGrowthInsideParams['tickLower'],
    tickUpper: GetRewardGrowthInsideParams['tickUpper'],
    _rewardGrowthGlobalX128: GetRewardGrowthInsideParams['_rewardGrowthGlobalX128'],
  ) {
    return this.eth_call(functions.getRewardGrowthInside, {
      tickLower,
      tickUpper,
      _rewardGrowthGlobalX128,
    });
  }

  lastUpdated() {
    return this.eth_call(functions.lastUpdated, {});
  }

  liquidity() {
    return this.eth_call(functions.liquidity, {});
  }

  maxLiquidityPerTick() {
    return this.eth_call(functions.maxLiquidityPerTick, {});
  }

  nft() {
    return this.eth_call(functions.nft, {});
  }

  observations(_0: ObservationsParams['_0']) {
    return this.eth_call(functions.observations, { _0 });
  }

  observe(secondsAgos: ObserveParams['secondsAgos']) {
    return this.eth_call(functions.observe, { secondsAgos });
  }

  periodFinish() {
    return this.eth_call(functions.periodFinish, {});
  }

  positions(_0: PositionsParams['_0']) {
    return this.eth_call(functions.positions, { _0 });
  }

  rewardGrowthGlobalX128() {
    return this.eth_call(functions.rewardGrowthGlobalX128, {});
  }

  rewardRate() {
    return this.eth_call(functions.rewardRate, {});
  }

  rewardReserve() {
    return this.eth_call(functions.rewardReserve, {});
  }

  rollover() {
    return this.eth_call(functions.rollover, {});
  }

  slot0() {
    return this.eth_call(functions.slot0, {});
  }

  snapshotCumulativesInside(
    tickLower: SnapshotCumulativesInsideParams['tickLower'],
    tickUpper: SnapshotCumulativesInsideParams['tickUpper'],
  ) {
    return this.eth_call(functions.snapshotCumulativesInside, { tickLower, tickUpper });
  }

  stakedLiquidity() {
    return this.eth_call(functions.stakedLiquidity, {});
  }

  tickBitmap(_0: TickBitmapParams['_0']) {
    return this.eth_call(functions.tickBitmap, { _0 });
  }

  tickSpacing() {
    return this.eth_call(functions.tickSpacing, {});
  }

  ticks(_0: TicksParams['_0']) {
    return this.eth_call(functions.ticks, { _0 });
  }

  token0() {
    return this.eth_call(functions.token0, {});
  }

  token1() {
    return this.eth_call(functions.token1, {});
  }

  unstakedFee() {
    return this.eth_call(functions.unstakedFee, {});
  }
}

/// Event types
export type BurnEventArgs = EParams<typeof events.Burn>;
export type CollectEventArgs = EParams<typeof events.Collect>;
export type CollectFeesEventArgs = EParams<typeof events.CollectFees>;
export type FlashEventArgs = EParams<typeof events.Flash>;
export type IncreaseObservationCardinalityNextEventArgs = EParams<
  typeof events.IncreaseObservationCardinalityNext
>;
export type InitializeEventArgs = EParams<typeof events.Initialize>;
export type MintEventArgs = EParams<typeof events.Mint>;
export type SetFeeProtocolEventArgs = EParams<typeof events.SetFeeProtocol>;
export type SwapEventArgs = EParams<typeof events.Swap>;

/// Function types
export type BurnParams_0 = FunctionArguments<
  (typeof functions)['burn(int24,int24,uint128,address)']
>;
export type BurnReturn_0 = FunctionReturn<(typeof functions)['burn(int24,int24,uint128,address)']>;

export type BurnParams_1 = FunctionArguments<(typeof functions)['burn(int24,int24,uint128)']>;
export type BurnReturn_1 = FunctionReturn<(typeof functions)['burn(int24,int24,uint128)']>;

export type CollectParams_0 = FunctionArguments<
  (typeof functions)['collect(address,int24,int24,uint128,uint128,address)']
>;
export type CollectReturn_0 = FunctionReturn<
  (typeof functions)['collect(address,int24,int24,uint128,uint128,address)']
>;

export type CollectParams_1 = FunctionArguments<
  (typeof functions)['collect(address,int24,int24,uint128,uint128)']
>;
export type CollectReturn_1 = FunctionReturn<
  (typeof functions)['collect(address,int24,int24,uint128,uint128)']
>;

export type CollectFeesParams = FunctionArguments<typeof functions.collectFees>;
export type CollectFeesReturn = FunctionReturn<typeof functions.collectFees>;

export type FactoryParams = FunctionArguments<typeof functions.factory>;
export type FactoryReturn = FunctionReturn<typeof functions.factory>;

export type FactoryRegistryParams = FunctionArguments<typeof functions.factoryRegistry>;
export type FactoryRegistryReturn = FunctionReturn<typeof functions.factoryRegistry>;

export type FeeParams = FunctionArguments<typeof functions.fee>;
export type FeeReturn = FunctionReturn<typeof functions.fee>;

export type FeeGrowthGlobal0X128Params = FunctionArguments<typeof functions.feeGrowthGlobal0X128>;
export type FeeGrowthGlobal0X128Return = FunctionReturn<typeof functions.feeGrowthGlobal0X128>;

export type FeeGrowthGlobal1X128Params = FunctionArguments<typeof functions.feeGrowthGlobal1X128>;
export type FeeGrowthGlobal1X128Return = FunctionReturn<typeof functions.feeGrowthGlobal1X128>;

export type FlashParams = FunctionArguments<typeof functions.flash>;
export type FlashReturn = FunctionReturn<typeof functions.flash>;

export type GaugeParams = FunctionArguments<typeof functions.gauge>;
export type GaugeReturn = FunctionReturn<typeof functions.gauge>;

export type GaugeFeesParams = FunctionArguments<typeof functions.gaugeFees>;
export type GaugeFeesReturn = FunctionReturn<typeof functions.gaugeFees>;

export type GetRewardGrowthInsideParams = FunctionArguments<typeof functions.getRewardGrowthInside>;
export type GetRewardGrowthInsideReturn = FunctionReturn<typeof functions.getRewardGrowthInside>;

export type IncreaseObservationCardinalityNextParams = FunctionArguments<
  typeof functions.increaseObservationCardinalityNext
>;
export type IncreaseObservationCardinalityNextReturn = FunctionReturn<
  typeof functions.increaseObservationCardinalityNext
>;

export type InitializeParams = FunctionArguments<typeof functions.initialize>;
export type InitializeReturn = FunctionReturn<typeof functions.initialize>;

export type LastUpdatedParams = FunctionArguments<typeof functions.lastUpdated>;
export type LastUpdatedReturn = FunctionReturn<typeof functions.lastUpdated>;

export type LiquidityParams = FunctionArguments<typeof functions.liquidity>;
export type LiquidityReturn = FunctionReturn<typeof functions.liquidity>;

export type MaxLiquidityPerTickParams = FunctionArguments<typeof functions.maxLiquidityPerTick>;
export type MaxLiquidityPerTickReturn = FunctionReturn<typeof functions.maxLiquidityPerTick>;

export type MintParams = FunctionArguments<typeof functions.mint>;
export type MintReturn = FunctionReturn<typeof functions.mint>;

export type NftParams = FunctionArguments<typeof functions.nft>;
export type NftReturn = FunctionReturn<typeof functions.nft>;

export type ObservationsParams = FunctionArguments<typeof functions.observations>;
export type ObservationsReturn = FunctionReturn<typeof functions.observations>;

export type ObserveParams = FunctionArguments<typeof functions.observe>;
export type ObserveReturn = FunctionReturn<typeof functions.observe>;

export type PeriodFinishParams = FunctionArguments<typeof functions.periodFinish>;
export type PeriodFinishReturn = FunctionReturn<typeof functions.periodFinish>;

export type PositionsParams = FunctionArguments<typeof functions.positions>;
export type PositionsReturn = FunctionReturn<typeof functions.positions>;

export type RewardGrowthGlobalX128Params = FunctionArguments<
  typeof functions.rewardGrowthGlobalX128
>;
export type RewardGrowthGlobalX128Return = FunctionReturn<typeof functions.rewardGrowthGlobalX128>;

export type RewardRateParams = FunctionArguments<typeof functions.rewardRate>;
export type RewardRateReturn = FunctionReturn<typeof functions.rewardRate>;

export type RewardReserveParams = FunctionArguments<typeof functions.rewardReserve>;
export type RewardReserveReturn = FunctionReturn<typeof functions.rewardReserve>;

export type RolloverParams = FunctionArguments<typeof functions.rollover>;
export type RolloverReturn = FunctionReturn<typeof functions.rollover>;

export type SetGaugeAndPositionManagerParams = FunctionArguments<
  typeof functions.setGaugeAndPositionManager
>;
export type SetGaugeAndPositionManagerReturn = FunctionReturn<
  typeof functions.setGaugeAndPositionManager
>;

export type Slot0Params = FunctionArguments<typeof functions.slot0>;
export type Slot0Return = FunctionReturn<typeof functions.slot0>;

export type SnapshotCumulativesInsideParams = FunctionArguments<
  typeof functions.snapshotCumulativesInside
>;
export type SnapshotCumulativesInsideReturn = FunctionReturn<
  typeof functions.snapshotCumulativesInside
>;

export type StakeParams = FunctionArguments<typeof functions.stake>;
export type StakeReturn = FunctionReturn<typeof functions.stake>;

export type StakedLiquidityParams = FunctionArguments<typeof functions.stakedLiquidity>;
export type StakedLiquidityReturn = FunctionReturn<typeof functions.stakedLiquidity>;

export type SwapParams = FunctionArguments<typeof functions.swap>;
export type SwapReturn = FunctionReturn<typeof functions.swap>;

export type SyncRewardParams = FunctionArguments<typeof functions.syncReward>;
export type SyncRewardReturn = FunctionReturn<typeof functions.syncReward>;

export type TickBitmapParams = FunctionArguments<typeof functions.tickBitmap>;
export type TickBitmapReturn = FunctionReturn<typeof functions.tickBitmap>;

export type TickSpacingParams = FunctionArguments<typeof functions.tickSpacing>;
export type TickSpacingReturn = FunctionReturn<typeof functions.tickSpacing>;

export type TicksParams = FunctionArguments<typeof functions.ticks>;
export type TicksReturn = FunctionReturn<typeof functions.ticks>;

export type Token0Params = FunctionArguments<typeof functions.token0>;
export type Token0Return = FunctionReturn<typeof functions.token0>;

export type Token1Params = FunctionArguments<typeof functions.token1>;
export type Token1Return = FunctionReturn<typeof functions.token1>;

export type UnstakedFeeParams = FunctionArguments<typeof functions.unstakedFee>;
export type UnstakedFeeReturn = FunctionReturn<typeof functions.unstakedFee>;

export type UpdateRewardsGrowthGlobalParams = FunctionArguments<
  typeof functions.updateRewardsGrowthGlobal
>;
export type UpdateRewardsGrowthGlobalReturn = FunctionReturn<
  typeof functions.updateRewardsGrowthGlobal
>;
