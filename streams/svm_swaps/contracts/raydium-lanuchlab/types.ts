import {
  Codec,
  struct,
  address,
  u64,
  u8,
  ref,
  sum,
  u16,
  fixedArray,
  string,
  tuple,
  unit,
} from '@subsquid/borsh';

/**
 * Emitted when vesting token claimed by beneficiary
 */
export interface ClaimVestedEvent {
  poolState: string;
  beneficiary: string;
  claimAmount: bigint;
}

/**
 * Emitted when vesting token claimed by beneficiary
 */
export const ClaimVestedEvent: Codec<ClaimVestedEvent> = struct({
  poolState: address,
  beneficiary: address,
  claimAmount: u64,
});

export interface ConstantCurve {
  supply: bigint;
  totalBaseSell: bigint;
  totalQuoteFundRaising: bigint;
  migrateType: number;
}

export const ConstantCurve: Codec<ConstantCurve> = struct({
  supply: u64,
  totalBaseSell: u64,
  totalQuoteFundRaising: u64,
  migrateType: u8,
});

/**
 * Emitted when vest_account created
 */
export interface CreateVestingEvent {
  poolState: string;
  beneficiary: string;
  shareAmount: bigint;
}

/**
 * Emitted when vest_account created
 */
export const CreateVestingEvent: Codec<CreateVestingEvent> = struct({
  poolState: address,
  beneficiary: address,
  shareAmount: u64,
});

export type CurveParams_Constant = {
  data: ConstantCurve;
};

export const CurveParams_Constant = struct({
  data: ref(() => ConstantCurve),
});

export type CurveParams_Fixed = {
  data: FixedCurve;
};

export const CurveParams_Fixed = struct({
  data: ref(() => FixedCurve),
});

export type CurveParams_Linear = {
  data: LinearCurve;
};

export const CurveParams_Linear = struct({
  data: ref(() => LinearCurve),
});

export type CurveParams =
  | {
      kind: 'Constant';
      value: CurveParams_Constant;
    }
  | {
      kind: 'Fixed';
      value: CurveParams_Fixed;
    }
  | {
      kind: 'Linear';
      value: CurveParams_Linear;
    };

export const CurveParams: Codec<CurveParams> = sum(1, {
  Constant: {
    discriminator: 0,
    value: CurveParams_Constant,
  },
  Fixed: {
    discriminator: 1,
    value: CurveParams_Fixed,
  },
  Linear: {
    discriminator: 2,
    value: CurveParams_Linear,
  },
});

export interface FixedCurve {
  supply: bigint;
  totalQuoteFundRaising: bigint;
  migrateType: number;
}

export const FixedCurve: Codec<FixedCurve> = struct({
  supply: u64,
  totalQuoteFundRaising: u64,
  migrateType: u8,
});

/**
 * Holds the current owner of the factory
 */
export interface GlobalConfig {
  epoch: bigint;
  curveType: number;
  index: number;
  migrateFee: bigint;
  tradeFeeRate: bigint;
  maxShareFeeRate: bigint;
  minBaseSupply: bigint;
  maxLockRate: bigint;
  minBaseSellRate: bigint;
  minBaseMigrateRate: bigint;
  minQuoteFundRaising: bigint;
  quoteMint: string;
  protocolFeeOwner: string;
  migrateFeeOwner: string;
  migrateToAmmWallet: string;
  migrateToCpswapWallet: string;
  padding: Array<bigint>;
}

/**
 * Holds the current owner of the factory
 */
export const GlobalConfig: Codec<GlobalConfig> = struct({
  epoch: u64,
  curveType: u8,
  index: u16,
  migrateFee: u64,
  tradeFeeRate: u64,
  maxShareFeeRate: u64,
  minBaseSupply: u64,
  maxLockRate: u64,
  minBaseSellRate: u64,
  minBaseMigrateRate: u64,
  minQuoteFundRaising: u64,
  quoteMint: address,
  protocolFeeOwner: address,
  migrateFeeOwner: address,
  migrateToAmmWallet: address,
  migrateToCpswapWallet: address,
  padding: fixedArray(u64, 16),
});

export interface LinearCurve {
  supply: bigint;
  totalQuoteFundRaising: bigint;
  migrateType: number;
}

export const LinearCurve: Codec<LinearCurve> = struct({
  supply: u64,
  totalQuoteFundRaising: u64,
  migrateType: u8,
});

/**
 * Represents the parameters for initializing a platform config account(Only support MigrateType::CPSWAP)
 * # Fields
 * * `platform_scale` - Scale of the platform liquidity quantity rights will be converted into NFT
 * * `creator_scale` - Scale of the token creator liquidity quantity rights will be converted into NFT
 * * `burn_scale` - Scale of liquidity directly to burn
 *
 * * platform_scale + creator_scale + burn_scale = RATE_DENOMINATOR_VALUE
 */
export interface MigrateNftInfo {
  platformScale: bigint;
  creatorScale: bigint;
  burnScale: bigint;
}

/**
 * Represents the parameters for initializing a platform config account(Only support MigrateType::CPSWAP)
 * # Fields
 * * `platform_scale` - Scale of the platform liquidity quantity rights will be converted into NFT
 * * `creator_scale` - Scale of the token creator liquidity quantity rights will be converted into NFT
 * * `burn_scale` - Scale of liquidity directly to burn
 *
 * * platform_scale + creator_scale + burn_scale = RATE_DENOMINATOR_VALUE
 */
export const MigrateNftInfo: Codec<MigrateNftInfo> = struct({
  platformScale: u64,
  creatorScale: u64,
  burnScale: u64,
});

/**
 * Represents the parameters for initializing a new token mint
 * # Fields
 * * `decimals` - Number of decimal places for the token
 * * `name` - Name of the token
 * * `symbol` - Symbol/ticker of the token
 * * `uri` - URI pointing to token metadata
 */
export interface MintParams {
  decimals: number;
  name: string;
  symbol: string;
  uri: string;
}

/**
 * Represents the parameters for initializing a new token mint
 * # Fields
 * * `decimals` - Number of decimal places for the token
 * * `name` - Name of the token
 * * `symbol` - Symbol/ticker of the token
 * * `uri` - URI pointing to token metadata
 */
export const MintParams: Codec<MintParams> = struct({
  decimals: u8,
  name: string,
  symbol: string,
  uri: string,
});

export interface PlatformConfig {
  epoch: bigint;
  platformFeeWallet: string;
  platformNftWallet: string;
  platformScale: bigint;
  creatorScale: bigint;
  burnScale: bigint;
  feeRate: bigint;
  name: Array<number>;
  web: Array<number>;
  img: Array<number>;
  padding: Array<number>;
}

export const PlatformConfig: Codec<PlatformConfig> = struct({
  epoch: u64,
  platformFeeWallet: address,
  platformNftWallet: address,
  platformScale: u64,
  creatorScale: u64,
  burnScale: u64,
  feeRate: u64,
  name: fixedArray(u8, 64),
  web: fixedArray(u8, 256),
  img: fixedArray(u8, 256),
  padding: fixedArray(u8, 256),
});

export type PlatformConfigParam_FeeWallet = [string];

export const PlatformConfigParam_FeeWallet = tuple([address]);

export type PlatformConfigParam_NFTWallet = [string];

export const PlatformConfigParam_NFTWallet = tuple([address]);

export type PlatformConfigParam_MigrateNftInfo = [MigrateNftInfo];

export const PlatformConfigParam_MigrateNftInfo = tuple([ref(() => MigrateNftInfo)]);

export type PlatformConfigParam_FeeRate = [bigint];

export const PlatformConfigParam_FeeRate = tuple([u64]);

export type PlatformConfigParam_Name = [string];

export const PlatformConfigParam_Name = tuple([string]);

export type PlatformConfigParam_Web = [string];

export const PlatformConfigParam_Web = tuple([string]);

export type PlatformConfigParam_Img = [string];

export const PlatformConfigParam_Img = tuple([string]);

export type PlatformConfigParam =
  | {
      kind: 'FeeWallet';
      value: PlatformConfigParam_FeeWallet;
    }
  | {
      kind: 'NFTWallet';
      value: PlatformConfigParam_NFTWallet;
    }
  | {
      kind: 'MigrateNftInfo';
      value: PlatformConfigParam_MigrateNftInfo;
    }
  | {
      kind: 'FeeRate';
      value: PlatformConfigParam_FeeRate;
    }
  | {
      kind: 'Name';
      value: PlatformConfigParam_Name;
    }
  | {
      kind: 'Web';
      value: PlatformConfigParam_Web;
    }
  | {
      kind: 'Img';
      value: PlatformConfigParam_Img;
    };

export const PlatformConfigParam: Codec<PlatformConfigParam> = sum(1, {
  FeeWallet: {
    discriminator: 0,
    value: PlatformConfigParam_FeeWallet,
  },
  NFTWallet: {
    discriminator: 1,
    value: PlatformConfigParam_NFTWallet,
  },
  MigrateNftInfo: {
    discriminator: 2,
    value: PlatformConfigParam_MigrateNftInfo,
  },
  FeeRate: {
    discriminator: 3,
    value: PlatformConfigParam_FeeRate,
  },
  Name: {
    discriminator: 4,
    value: PlatformConfigParam_Name,
  },
  Web: {
    discriminator: 5,
    value: PlatformConfigParam_Web,
  },
  Img: {
    discriminator: 6,
    value: PlatformConfigParam_Img,
  },
});

/**
 * Represents the parameters for initializing a platform config account
 * # Fields
 * * `migrate_nft_info` - The platform configures liquidity info during migration(Only support MigrateType::CPSWAP)
 * * `fee_rate` - Fee rate of the platform
 * * `name` - Name of the platform
 * * `web` - Website of the platform
 * * `img` - Image link of the platform
 */
export interface PlatformParams {
  migrateNftInfo: MigrateNftInfo;
  feeRate: bigint;
  name: string;
  web: string;
  img: string;
}

/**
 * Represents the parameters for initializing a platform config account
 * # Fields
 * * `migrate_nft_info` - The platform configures liquidity info during migration(Only support MigrateType::CPSWAP)
 * * `fee_rate` - Fee rate of the platform
 * * `name` - Name of the platform
 * * `web` - Website of the platform
 * * `img` - Image link of the platform
 */
export const PlatformParams: Codec<PlatformParams> = struct({
  migrateNftInfo: ref(() => MigrateNftInfo),
  feeRate: u64,
  name: string,
  web: string,
  img: string,
});

/**
 * Emitted when pool created
 */
export interface PoolCreateEvent {
  poolState: string;
  creator: string;
  config: string;
  baseMintParam: MintParams;
  curveParam: CurveParams;
  vestingParam: VestingParams;
}

/**
 * Emitted when pool created
 */
export const PoolCreateEvent: Codec<PoolCreateEvent> = struct({
  poolState: address,
  creator: address,
  config: address,
  baseMintParam: ref(() => MintParams),
  curveParam: ref(() => CurveParams),
  vestingParam: ref(() => VestingParams),
});

/**
 * Represents the state of a trading pool in the protocol
 * Stores all essential information about pool balances, fees, and configuration
 */
export interface PoolState {
  epoch: bigint;
  authBump: number;
  status: number;
  baseDecimals: number;
  quoteDecimals: number;
  migrateType: number;
  supply: bigint;
  totalBaseSell: bigint;
  virtualBase: bigint;
  virtualQuote: bigint;
  realBase: bigint;
  realQuote: bigint;
  totalQuoteFundRaising: bigint;
  quoteProtocolFee: bigint;
  platformFee: bigint;
  migrateFee: bigint;
  vestingSchedule: VestingSchedule;
  globalConfig: string;
  platformConfig: string;
  baseMint: string;
  quoteMint: string;
  baseVault: string;
  quoteVault: string;
  creator: string;
  padding: Array<bigint>;
}

/**
 * Represents the state of a trading pool in the protocol
 * Stores all essential information about pool balances, fees, and configuration
 */
export const PoolState: Codec<PoolState> = struct({
  epoch: u64,
  authBump: u8,
  status: u8,
  baseDecimals: u8,
  quoteDecimals: u8,
  migrateType: u8,
  supply: u64,
  totalBaseSell: u64,
  virtualBase: u64,
  virtualQuote: u64,
  realBase: u64,
  realQuote: u64,
  totalQuoteFundRaising: u64,
  quoteProtocolFee: u64,
  platformFee: u64,
  migrateFee: u64,
  vestingSchedule: ref(() => VestingSchedule),
  globalConfig: address,
  platformConfig: address,
  baseMint: address,
  quoteMint: address,
  baseVault: address,
  quoteVault: address,
  creator: address,
  padding: fixedArray(u64, 8),
});

export type PoolStatus_Fund = undefined;

export const PoolStatus_Fund = unit;

export type PoolStatus_Migrate = undefined;

export const PoolStatus_Migrate = unit;

export type PoolStatus_Trade = undefined;

export const PoolStatus_Trade = unit;

/**
 * Represents the different states a pool can be in
 * * Fund - Initial state where pool is accepting funds
 * * Migrate - Pool funding has ended and waiting for migration
 * * Trade - Pool migration is complete and amm trading is enabled
 */
export type PoolStatus =
  | {
      kind: 'Fund';
      value?: PoolStatus_Fund;
    }
  | {
      kind: 'Migrate';
      value?: PoolStatus_Migrate;
    }
  | {
      kind: 'Trade';
      value?: PoolStatus_Trade;
    };

/**
 * Represents the different states a pool can be in
 * * Fund - Initial state where pool is accepting funds
 * * Migrate - Pool funding has ended and waiting for migration
 * * Trade - Pool migration is complete and amm trading is enabled
 */
export const PoolStatus: Codec<PoolStatus> = sum(1, {
  Fund: {
    discriminator: 0,
    value: PoolStatus_Fund,
  },
  Migrate: {
    discriminator: 1,
    value: PoolStatus_Migrate,
  },
  Trade: {
    discriminator: 2,
    value: PoolStatus_Trade,
  },
});

export type TradeDirection_Buy = undefined;

export const TradeDirection_Buy = unit;

export type TradeDirection_Sell = undefined;

export const TradeDirection_Sell = unit;

/**
 * Specifies the direction of a trade in the bonding curve
 * This is important because curves can treat tokens differently through weights or offsets
 */
export type TradeDirection =
  | {
      kind: 'Buy';
      value?: TradeDirection_Buy;
    }
  | {
      kind: 'Sell';
      value?: TradeDirection_Sell;
    };

/**
 * Specifies the direction of a trade in the bonding curve
 * This is important because curves can treat tokens differently through weights or offsets
 */
export const TradeDirection: Codec<TradeDirection> = sum(1, {
  Buy: {
    discriminator: 0,
    value: TradeDirection_Buy,
  },
  Sell: {
    discriminator: 1,
    value: TradeDirection_Sell,
  },
});

/**
 * Emitted when trade process
 */
export interface TradeEvent {
  poolState: string;
  totalBaseSell: bigint;
  virtualBase: bigint;
  virtualQuote: bigint;
  realBaseBefore: bigint;
  realQuoteBefore: bigint;
  realBaseAfter: bigint;
  realQuoteAfter: bigint;
  amountIn: bigint;
  amountOut: bigint;
  protocolFee: bigint;
  platformFee: bigint;
  shareFee: bigint;
  tradeDirection: TradeDirection;
  poolStatus: PoolStatus;
}

/**
 * Emitted when trade process
 */
export const TradeEvent: Codec<TradeEvent> = struct({
  poolState: address,
  totalBaseSell: u64,
  virtualBase: u64,
  virtualQuote: u64,
  realBaseBefore: u64,
  realQuoteBefore: u64,
  realBaseAfter: u64,
  realQuoteAfter: u64,
  amountIn: u64,
  amountOut: u64,
  protocolFee: u64,
  platformFee: u64,
  shareFee: u64,
  tradeDirection: ref(() => TradeDirection),
  poolStatus: ref(() => PoolStatus),
});

export interface VestingParams {
  totalLockedAmount: bigint;
  cliffPeriod: bigint;
  unlockPeriod: bigint;
}

export const VestingParams: Codec<VestingParams> = struct({
  totalLockedAmount: u64,
  cliffPeriod: u64,
  unlockPeriod: u64,
});

export interface VestingRecord {
  epoch: bigint;
  pool: string;
  beneficiary: string;
  claimedAmount: bigint;
  tokenShareAmount: bigint;
  padding: Array<bigint>;
}

export const VestingRecord: Codec<VestingRecord> = struct({
  epoch: u64,
  pool: address,
  beneficiary: address,
  claimedAmount: u64,
  tokenShareAmount: u64,
  padding: fixedArray(u64, 8),
});

export interface VestingSchedule {
  totalLockedAmount: bigint;
  cliffPeriod: bigint;
  unlockPeriod: bigint;
  startTime: bigint;
  allocatedShareAmount: bigint;
}

export const VestingSchedule: Codec<VestingSchedule> = struct({
  totalLockedAmount: u64,
  cliffPeriod: u64,
  unlockPeriod: u64,
  startTime: u64,
  allocatedShareAmount: u64,
});
