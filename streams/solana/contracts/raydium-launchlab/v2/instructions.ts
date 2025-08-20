import { struct, u64, unit, u8, u16, option } from '@subsquid/borsh';
import { instruction } from '../../abi.support';
import {
  PlatformParams,
  MintParams,
  CurveParams,
  VestingParams,
  AmmCreatorFeeOn,
  TransferFeeExtensionParams,
  PlatformConfigParam,
  BondingCurveParam,
} from './types';

/**
 * Use the given amount of quote tokens to purchase base tokens.
 * # Arguments
 *
 * * `ctx` - The context of accounts
 * * `amount_in` - Amount of quote token to purchase
 * * `minimum_amount_out` - Minimum amount of base token to receive (slippage protection)
 * * `share_fee_rate` - Fee rate for the share
 *
 */
export interface BuyExactIn {
  amountIn: bigint;
  minimumAmountOut: bigint;
  shareFeeRate: bigint;
}

/**
 * Use the given amount of quote tokens to purchase base tokens.
 * # Arguments
 *
 * * `ctx` - The context of accounts
 * * `amount_in` - Amount of quote token to purchase
 * * `minimum_amount_out` - Minimum amount of base token to receive (slippage protection)
 * * `share_fee_rate` - Fee rate for the share
 *
 */
export const buyExactIn = instruction(
  {
    d8: '0xfaea0d7bd59c13ec',
  },
  {
    /**
     * The user performing the swap operation
     * Must sign the transaction and pay for fees
     */
    payer: 0,
    /**
     * PDA that acts as the authority for pool vault operations
     * Generated using AUTH_SEED
     */
    authority: 1,
    /**
     * Global configuration account containing protocol-wide settings
     * Used to read protocol fee rates and curve type
     */
    globalConfig: 2,
    /**
     * Platform configuration account containing platform-wide settings
     * Used to read platform fee rate
     */
    platformConfig: 3,
    /**
     * The pool state account where the swap will be performed
     * Contains current pool parameters and balances
     */
    poolState: 4,
    /**
     * The user's token account for base tokens (tokens being bought)
     * Will receive the output tokens after the swap
     */
    userBaseToken: 5,
    /**
     * The user's token account for quote tokens (tokens being sold)
     * Will be debited for the input amount
     */
    userQuoteToken: 6,
    /**
     * The pool's vault for base tokens
     * Will be debited to send tokens to the user
     */
    baseVault: 7,
    /**
     * The pool's vault for quote tokens
     * Will receive the input tokens from the user
     */
    quoteVault: 8,
    /**
     * The mint of the base token
     * Used for transfer fee calculations if applicable
     */
    baseTokenMint: 9,
    /**
     * The mint of the quote token
     */
    quoteTokenMint: 10,
    /**
     * SPL Token program for base token transfers
     */
    baseTokenProgram: 11,
    /**
     * SPL Token program for quote token transfers
     */
    quoteTokenProgram: 12,
    eventAuthority: 13,
    program: 14,
  },
  struct({
    amountIn: u64,
    minimumAmountOut: u64,
    shareFeeRate: u64,
  }),
);

/**
 * Use quote tokens to purchase the given amount of base tokens.
 * # Arguments
 *
 * * `ctx` - The context of accounts
 * * `amount_out` - Amount of base token to receive
 * * `maximum_amount_in` - Maximum amount of quote token to purchase (slippage protection)
 * * `share_fee_rate` - Fee rate for the share
 */
export interface BuyExactOut {
  amountOut: bigint;
  maximumAmountIn: bigint;
  shareFeeRate: bigint;
}

/**
 * Use quote tokens to purchase the given amount of base tokens.
 * # Arguments
 *
 * * `ctx` - The context of accounts
 * * `amount_out` - Amount of base token to receive
 * * `maximum_amount_in` - Maximum amount of quote token to purchase (slippage protection)
 * * `share_fee_rate` - Fee rate for the share
 */
export const buyExactOut = instruction(
  {
    d8: '0x18d3742869039938',
  },
  {
    /**
     * The user performing the swap operation
     * Must sign the transaction and pay for fees
     */
    payer: 0,
    /**
     * PDA that acts as the authority for pool vault operations
     * Generated using AUTH_SEED
     */
    authority: 1,
    /**
     * Global configuration account containing protocol-wide settings
     * Used to read protocol fee rates and curve type
     */
    globalConfig: 2,
    /**
     * Platform configuration account containing platform-wide settings
     * Used to read platform fee rate
     */
    platformConfig: 3,
    /**
     * The pool state account where the swap will be performed
     * Contains current pool parameters and balances
     */
    poolState: 4,
    /**
     * The user's token account for base tokens (tokens being bought)
     * Will receive the output tokens after the swap
     */
    userBaseToken: 5,
    /**
     * The user's token account for quote tokens (tokens being sold)
     * Will be debited for the input amount
     */
    userQuoteToken: 6,
    /**
     * The pool's vault for base tokens
     * Will be debited to send tokens to the user
     */
    baseVault: 7,
    /**
     * The pool's vault for quote tokens
     * Will receive the input tokens from the user
     */
    quoteVault: 8,
    /**
     * The mint of the base token
     * Used for transfer fee calculations if applicable
     */
    baseTokenMint: 9,
    /**
     * The mint of the quote token
     */
    quoteTokenMint: 10,
    /**
     * SPL Token program for base token transfers
     */
    baseTokenProgram: 11,
    /**
     * SPL Token program for quote token transfers
     */
    quoteTokenProgram: 12,
    eventAuthority: 13,
    program: 14,
  },
  struct({
    amountOut: u64,
    maximumAmountIn: u64,
    shareFeeRate: u64,
  }),
);

/**
 * Claim the fee from the exclusive creator fee vault.
 * # Arguments
 *
 * * `ctx` - The context of accounts
 *
 */
export type ClaimCreatorFee = undefined;

/**
 * Claim the fee from the exclusive creator fee vault.
 * # Arguments
 *
 * * `ctx` - The context of accounts
 *
 */
export const claimCreatorFee = instruction(
  {
    d8: '0x1a618acb84ab8dfc',
  },
  {
    /**
     * The pool creator
     */
    creator: 0,
    feeVaultAuthority: 1,
    /**
     * The creator fee vault
     */
    creatorFeeVault: 2,
    recipientTokenAccount: 3,
    /**
     * The mint for the quote token
     */
    quoteMint: 4,
    /**
     * SPL Token program for the quote token
     */
    tokenProgram: 5,
    /**
     * Required for account creation
     */
    systemProgram: 6,
    /**
     * Required for associated token program
     */
    associatedTokenProgram: 7,
  },
  unit,
);

/**
 * Claim platform fee
 * # Arguments
 *
 * * `ctx` - The context of accounts
 *
 */
export type ClaimPlatformFee = undefined;

/**
 * Claim platform fee
 * # Arguments
 *
 * * `ctx` - The context of accounts
 *
 */
export const claimPlatformFee = instruction(
  {
    d8: '0x9c27d0874ced3d48',
  },
  {
    /**
     * Only the wallet stored in platform_config can collect platform fees
     */
    platformFeeWallet: 0,
    /**
     * PDA that acts as the authority for pool vault and mint operations
     * Generated using AUTH_SEED
     */
    authority: 1,
    /**
     * Account that stores the pool's state and parameters
     * PDA generated using POOL_SEED and both token mints
     */
    poolState: 2,
    /**
     * The platform config account
     */
    platformConfig: 3,
    quoteVault: 4,
    /**
     * The address that receives the collected quote token fees
     */
    recipientTokenAccount: 5,
    /**
     * The mint of quote token vault
     */
    quoteMint: 6,
    /**
     * SPL program for input token transfers
     */
    tokenProgram: 7,
    /**
     * Required for account creation
     */
    systemProgram: 8,
    /**
     * Required for associated token program
     */
    associatedTokenProgram: 9,
  },
  unit,
);

/**
 * Claim the fee from the exclusive platform fee vault.
 * # Arguments
 *
 * * `ctx` - The context of accounts
 *
 */
export type ClaimPlatformFeeFromVault = undefined;

/**
 * Claim the fee from the exclusive platform fee vault.
 * # Arguments
 *
 * * `ctx` - The context of accounts
 *
 */
export const claimPlatformFeeFromVault = instruction(
  {
    d8: '0x75f1c6a8f8da501d',
  },
  {
    /**
     * Only the wallet stored in platform_config can collect platform fees
     */
    platformFeeWallet: 0,
    feeVaultAuthority: 1,
    /**
     * The platform config account
     */
    platformConfig: 2,
    /**
     * The platform fee vault
     */
    platformFeeVault: 3,
    /**
     * The address that receives the collected quote token fees
     */
    recipientTokenAccount: 4,
    /**
     * The mint of quote token vault
     */
    quoteMint: 5,
    /**
     * SPL program for input token transfers
     */
    tokenProgram: 6,
    /**
     * Required for account creation
     */
    systemProgram: 7,
    /**
     * Required for associated token program
     */
    associatedTokenProgram: 8,
  },
  unit,
);

/**
 * Claim vested token
 * # Arguments
 */
export type ClaimVestedToken = undefined;

/**
 * Claim vested token
 * # Arguments
 */
export const claimVestedToken = instruction(
  {
    d8: '0x3121681ebd9d4f23',
  },
  {
    /**
     * The beneficiary of the vesting account
     */
    beneficiary: 0,
    /**
     * PDA that acts as the authority for pool vault and mint operations
     * Generated using AUTH_SEED
     */
    authority: 1,
    /**
     * Account that stores the pool's state and parameters
     * PDA generated using POOL_SEED and both token mints
     */
    poolState: 2,
    /**
     * The vesting record account
     */
    vestingRecord: 3,
    /**
     * The pool's vault for base tokens
     * Will be debited to send tokens to the user
     */
    baseVault: 4,
    userBaseToken: 5,
    /**
     * The mint for the base token (token being sold)
     * Created in this instruction with specified decimals
     */
    baseTokenMint: 6,
    /**
     * SPL Token program for the base token
     * Must be the standard Token program
     */
    baseTokenProgram: 7,
    /**
     * Required for account creation
     */
    systemProgram: 8,
    /**
     * Required for associated token program
     */
    associatedTokenProgram: 9,
  },
  unit,
);

/**
 * Collects accumulated fees from the pool
 * # Arguments
 *
 * * `ctx` - The context of accounts
 *
 */
export type CollectFee = undefined;

/**
 * Collects accumulated fees from the pool
 * # Arguments
 *
 * * `ctx` - The context of accounts
 *
 */
export const collectFee = instruction(
  {
    d8: '0x3cadf767045d8230',
  },
  {
    /**
     * Only protocol_fee_owner saved in global_config can collect protocol fee now
     */
    owner: 0,
    authority: 1,
    /**
     * Pool state stores accumulated protocol fee amount
     */
    poolState: 2,
    /**
     * Global config account stores owner
     */
    globalConfig: 3,
    /**
     * The address that holds pool tokens for quote token
     */
    quoteVault: 4,
    /**
     * The mint of quote token vault
     */
    quoteMint: 5,
    /**
     * The address that receives the collected quote token fees
     */
    recipientTokenAccount: 6,
    /**
     * SPL program for input token transfers
     */
    tokenProgram: 7,
  },
  unit,
);

/**
 * Collects  migrate fees from the pool
 * # Arguments
 *
 * * `ctx` - The context of accounts
 *
 */
export type CollectMigrateFee = undefined;

/**
 * Collects  migrate fees from the pool
 * # Arguments
 *
 * * `ctx` - The context of accounts
 *
 */
export const collectMigrateFee = instruction(
  {
    d8: '0xffba96dfeb76c9ba',
  },
  {
    /**
     * Only migrate_fee_owner saved in global_config can collect migrate fee now
     */
    owner: 0,
    authority: 1,
    /**
     * Pool state stores accumulated protocol fee amount
     */
    poolState: 2,
    /**
     * Global config account stores owner
     */
    globalConfig: 3,
    /**
     * The address that holds pool tokens for quote token
     */
    quoteVault: 4,
    /**
     * The mint of quote token vault
     */
    quoteMint: 5,
    /**
     * The address that receives the collected quote token fees
     */
    recipientTokenAccount: 6,
    /**
     * SPL program for input token transfers
     */
    tokenProgram: 7,
  },
  unit,
);

/**
 * Creates a new configuration
 * # Arguments
 *
 * * `ctx` - The accounts needed by instruction
 * * `curve_type` - The type of bonding curve (0: ConstantProduct)
 * * `index` - The index of config, there may be multiple config with the same curve type.
 * * `trade_fee_rate` - Trade fee rate, must be less than RATE_DENOMINATOR_VALUE
 *
 */
export interface CreateConfig {
  curveType: number;
  index: number;
  migrateFee: bigint;
  tradeFeeRate: bigint;
}

/**
 * Creates a new configuration
 * # Arguments
 *
 * * `ctx` - The accounts needed by instruction
 * * `curve_type` - The type of bonding curve (0: ConstantProduct)
 * * `index` - The index of config, there may be multiple config with the same curve type.
 * * `trade_fee_rate` - Trade fee rate, must be less than RATE_DENOMINATOR_VALUE
 *
 */
export const createConfig = instruction(
  {
    d8: '0xc9cff3724b6f2fbd',
  },
  {
    /**
     * The protocol owner/admin account
     * Must match the predefined admin address
     * Has authority to create and modify protocol configurations
     */
    owner: 0,
    /**
     * Global configuration account that stores protocol-wide settings
     * PDA generated using GLOBAL_CONFIG_SEED, quote token mint, and curve type
     * Stores fee rates and protocol parameters
     */
    globalConfig: 1,
    /**
     * The mint address of the quote token (token used for buying)
     * This will be the standard token used for all pools with this config
     */
    quoteTokenMint: 2,
    /**
     * Account that will receive protocol fees
     */
    protocolFeeOwner: 3,
    /**
     * Account that will receive migrate fees
     */
    migrateFeeOwner: 4,
    /**
     * The control wallet address for migrating to amm
     */
    migrateToAmmWallet: 5,
    /**
     * The control wallet address for migrating to cpswap
     */
    migrateToCpswapWallet: 6,
    /**
     * Required for account creation
     */
    systemProgram: 7,
  },
  struct({
    curveType: u8,
    index: u16,
    migrateFee: u64,
    tradeFeeRate: u64,
  }),
);

/**
 * Create platform config account
 * # Arguments
 *
 * * `ctx` - The context of accounts
 * # Fields
 * * `fee_rate` - Fee rate of the platform
 * * `name` - Name of the platform
 * * `web` - Website of the platform
 * * `img` - Image link of the platform
 *
 */
export interface CreatePlatformConfig {
  platformParams: PlatformParams;
}

/**
 * Create platform config account
 * # Arguments
 *
 * * `ctx` - The context of accounts
 * # Fields
 * * `fee_rate` - Fee rate of the platform
 * * `name` - Name of the platform
 * * `web` - Website of the platform
 * * `img` - Image link of the platform
 *
 */
export const createPlatformConfig = instruction(
  {
    d8: '0xb05ac4affd71dc14',
  },
  {
    /**
     * The account paying for the initialization costs
     */
    platformAdmin: 0,
    platformFeeWallet: 1,
    platformNftWallet: 2,
    /**
     * The platform config account
     */
    platformConfig: 3,
    cpswapConfig: 4,
    /**
     * Required for account creation
     */
    systemProgram: 5,
    transferFeeExtensionAuthority: 6,
  },
  struct({
    platformParams: PlatformParams,
  }),
);

/**
 * Create vesting account
 * # Arguments
 *
 * * `ctx` - The context of accounts
 * * `share` - The share amount of base token to be vested
 *
 */
export interface CreateVestingAccount {
  shareAmount: bigint;
}

/**
 * Create vesting account
 * # Arguments
 *
 * * `ctx` - The context of accounts
 * * `share` - The share amount of base token to be vested
 *
 */
export const createVestingAccount = instruction(
  {
    d8: '0x81b2020dd9ace6da',
  },
  {
    /**
     * The account paying for the initialization costs
     * This can be any account with sufficient SOL to cover the transaction
     */
    creator: 0,
    /**
     * The beneficiary is used to receive the allocated linear release of tokens.
     * Once this account is set, it cannot be modified, so please ensure the validity of this account,
     * otherwise, the unlocked tokens will not be claimable.
     */
    beneficiary: 1,
    /**
     * The pool state account
     */
    poolState: 2,
    /**
     * The vesting record account
     */
    vestingRecord: 3,
    /**
     * Required for account creation
     */
    systemProgram: 4,
  },
  struct({
    shareAmount: u64,
  }),
);

/**
 * Initializes a new trading pool
 * # Arguments
 *
 * * `ctx` - The context of accounts containing pool and token information
 *
 */
export interface Initialize {
  baseMintParam: MintParams;
  curveParam: CurveParams;
  vestingParam: VestingParams;
}

/**
 * Initializes a new trading pool
 * # Arguments
 *
 * * `ctx` - The context of accounts containing pool and token information
 *
 */
export const initialize = instruction(
  {
    d8: '0xafaf6d1f0d989bed',
  },
  {
    /**
     * The account paying for the initialization costs
     * This can be any account with sufficient SOL to cover the transaction
     */
    payer: 0,
    creator: 1,
    /**
     * Global configuration account containing protocol-wide settings
     * Includes settings like quote token mint and fee parameters
     */
    globalConfig: 2,
    /**
     * Platform configuration account containing platform info
     * Includes settings like the fee_rate, name, web, img of the platform
     */
    platformConfig: 3,
    /**
     * PDA that acts as the authority for pool vault and mint operations
     * Generated using AUTH_SEED
     */
    authority: 4,
    /**
     * Account that stores the pool's state and parameters
     * PDA generated using POOL_SEED and both token mints
     */
    poolState: 5,
    /**
     * The mint for the base token (token being sold)
     * Created in this instruction with specified decimals
     */
    baseMint: 6,
    /**
     * The mint for the quote token (token used to buy)
     * Must match the quote_mint specified in global config
     */
    quoteMint: 7,
    /**
     * Token account that holds the pool's base tokens
     * PDA generated using POOL_VAULT_SEED
     */
    baseVault: 8,
    /**
     * Token account that holds the pool's quote tokens
     * PDA generated using POOL_VAULT_SEED
     */
    quoteVault: 9,
    /**
     * Account to store the base token's metadata
     * Created using Metaplex metadata program
     */
    metadataAccount: 10,
    /**
     * SPL Token program for the base token
     * Must be the standard Token program
     */
    baseTokenProgram: 11,
    /**
     * SPL Token program for the quote token
     */
    quoteTokenProgram: 12,
    /**
     * Metaplex Token Metadata program
     * Used to create metadata for the base token
     */
    metadataProgram: 13,
    /**
     * Required for account creation
     */
    systemProgram: 14,
    /**
     * Required for rent exempt calculations
     */
    rentProgram: 15,
    eventAuthority: 16,
    program: 17,
  },
  struct({
    baseMintParam: MintParams,
    curveParam: CurveParams,
    vestingParam: VestingParams,
  }),
);

/**
 * Initializes a new trading pool
 * # Arguments
 *
 * * `ctx` - The context of accounts containing pool and token information
 *
 */
export interface InitializeV2 {
  baseMintParam: MintParams;
  curveParam: CurveParams;
  vestingParam: VestingParams;
  ammFeeOn: AmmCreatorFeeOn;
}

/**
 * Initializes a new trading pool
 * # Arguments
 *
 * * `ctx` - The context of accounts containing pool and token information
 *
 */
export const initializeV2 = instruction(
  {
    d8: '0x4399af27da102620',
  },
  {
    /**
     * The account paying for the initialization costs
     * This can be any account with sufficient SOL to cover the transaction
     */
    payer: 0,
    creator: 1,
    /**
     * Global configuration account containing protocol-wide settings
     * Includes settings like quote token mint and fee parameters
     */
    globalConfig: 2,
    /**
     * Platform configuration account containing platform info
     * Includes settings like the fee_rate, name, web, img of the platform
     */
    platformConfig: 3,
    /**
     * PDA that acts as the authority for pool vault and mint operations
     * Generated using AUTH_SEED
     */
    authority: 4,
    /**
     * Account that stores the pool's state and parameters
     * PDA generated using POOL_SEED and both token mints
     */
    poolState: 5,
    /**
     * The mint for the base token (token being sold)
     * Created in this instruction with specified decimals
     */
    baseMint: 6,
    /**
     * The mint for the quote token (token used to buy)
     * Must match the quote_mint specified in global config
     */
    quoteMint: 7,
    /**
     * Token account that holds the pool's base tokens
     * PDA generated using POOL_VAULT_SEED
     */
    baseVault: 8,
    /**
     * Token account that holds the pool's quote tokens
     * PDA generated using POOL_VAULT_SEED
     */
    quoteVault: 9,
    /**
     * Account to store the base token's metadata
     * Created using Metaplex metadata program
     */
    metadataAccount: 10,
    /**
     * SPL Token program for the base token
     * Must be the standard Token program
     */
    baseTokenProgram: 11,
    /**
     * SPL Token program for the quote token
     */
    quoteTokenProgram: 12,
    /**
     * Metaplex Token Metadata program
     * Used to create metadata for the base token
     */
    metadataProgram: 13,
    /**
     * Required for account creation
     */
    systemProgram: 14,
    /**
     * Required for rent exempt calculations
     */
    rentProgram: 15,
    eventAuthority: 16,
    program: 17,
  },
  struct({
    baseMintParam: MintParams,
    curveParam: CurveParams,
    vestingParam: VestingParams,
    ammFeeOn: AmmCreatorFeeOn,
  }),
);

/**
 * Initializes a new trading pool with base token belongs to spl-token-2022,
 * pool created by this instruction must be migrated to cpswap after fundraising ends, i.e., curve_param.migrate_type = 1
 * # Arguments
 *
 * * `ctx` - The context of accounts containing pool and token information
 *
 */
export interface InitializeWithToken2022 {
  baseMintParam: MintParams;
  curveParam: CurveParams;
  vestingParam: VestingParams;
  ammFeeOn: AmmCreatorFeeOn;
  transferFeeExtensionParam?: TransferFeeExtensionParams | undefined;
}

/**
 * Initializes a new trading pool with base token belongs to spl-token-2022,
 * pool created by this instruction must be migrated to cpswap after fundraising ends, i.e., curve_param.migrate_type = 1
 * # Arguments
 *
 * * `ctx` - The context of accounts containing pool and token information
 *
 */
export const initializeWithToken2022 = instruction(
  {
    d8: '0x25be7ede2c9aab11',
  },
  {
    /**
     * The account paying for the initialization costs
     * This can be any account with sufficient SOL to cover the transaction
     */
    payer: 0,
    creator: 1,
    /**
     * Global configuration account containing protocol-wide settings
     * Includes settings like quote token mint and fee parameters
     */
    globalConfig: 2,
    /**
     * Platform configuration account containing platform info
     * Includes settings like the fee_rate, name, web, img of the platform
     */
    platformConfig: 3,
    /**
     * PDA that acts as the authority for pool vault and mint operations
     * Generated using AUTH_SEED
     */
    authority: 4,
    /**
     * Account that stores the pool's state and parameters
     * PDA generated using POOL_SEED and both token mints
     */
    poolState: 5,
    /**
     * The mint for the base token (token being sold)
     * Created in this instruction with specified decimals
     */
    baseMint: 6,
    /**
     * The mint for the quote token (token used to buy)
     * Must match the quote_mint specified in global config
     */
    quoteMint: 7,
    /**
     * Token account that holds the pool's base tokens
     * PDA generated using POOL_VAULT_SEED
     */
    baseVault: 8,
    /**
     * Token account that holds the pool's quote tokens
     * PDA generated using POOL_VAULT_SEED
     */
    quoteVault: 9,
    /**
     * SPL Token program for the base token
     */
    baseTokenProgram: 10,
    /**
     * SPL Token program for the quote token
     */
    quoteTokenProgram: 11,
    /**
     * Required for account creation
     */
    systemProgram: 12,
    eventAuthority: 13,
    program: 14,
  },
  struct({
    baseMintParam: MintParams,
    curveParam: CurveParams,
    vestingParam: VestingParams,
    ammFeeOn: AmmCreatorFeeOn,
    transferFeeExtensionParam: option(TransferFeeExtensionParams),
  }),
);

/**
 * # Arguments
 *
 * * `ctx` - The context of accounts
 *
 */
export interface MigrateToAmm {
  baseLotSize: bigint;
  quoteLotSize: bigint;
  marketVaultSignerNonce: number;
}

/**
 * # Arguments
 *
 * * `ctx` - The context of accounts
 *
 */
export const migrateToAmm = instruction(
  {
    d8: '0xcf52c091fecf91df',
  },
  {
    /**
     * Only migrate_to_amm_wallet can migrate to cpswap pool
     * This signer must match the migrate_to_amm_wallet saved in global_config
     */
    payer: 0,
    /**
     * The mint for the base token (token being sold)
     */
    baseMint: 1,
    /**
     * The mint for the quote token (token used to buy)
     */
    quoteMint: 2,
    openbookProgram: 3,
    /**
     * Account created and asigned to openbook_program but not been initialized
     */
    market: 4,
    /**
     * Account created and asigned to openbook_program but not been initialized
     */
    requestQueue: 5,
    /**
     * Account created and asigned to openbook_program but not been initialized
     */
    eventQueue: 6,
    /**
     * Account created and asigned to openbook_program but not been initialized
     */
    bids: 7,
    /**
     * Account created and asigned to openbook_program but not been initialized
     */
    asks: 8,
    marketVaultSigner: 9,
    /**
     * Token account that holds the market's base tokens
     */
    marketBaseVault: 10,
    /**
     * Token account that holds the market's quote tokens
     */
    marketQuoteVault: 11,
    ammProgram: 12,
    ammPool: 13,
    ammAuthority: 14,
    ammOpenOrders: 15,
    ammLpMint: 16,
    ammBaseVault: 17,
    ammQuoteVault: 18,
    ammTargetOrders: 19,
    ammConfig: 20,
    ammCreateFeeDestination: 21,
    /**
     * PDA that acts as the authority for pool vault operations
     * Generated using AUTH_SEED
     */
    authority: 22,
    /**
     * Account that stores the pool's state and parameters
     * PDA generated using POOL_SEED and both token mints
     */
    poolState: 23,
    /**
     * Global config account stores owner
     */
    globalConfig: 24,
    /**
     * The pool's vault for base tokens
     * Will be fully drained during migration
     */
    baseVault: 25,
    /**
     * The pool's vault for quote tokens
     * Will be fully drained during migration
     */
    quoteVault: 26,
    poolLpToken: 27,
    /**
     * SPL Token program for the base token
     * Must be the standard Token program
     */
    splTokenProgram: 28,
    /**
     * Program to create an ATA for receiving fee NFT
     */
    associatedTokenProgram: 29,
    /**
     * Required for account creation
     */
    systemProgram: 30,
    /**
     * Required for rent exempt calculations
     */
    rentProgram: 31,
  },
  struct({
    baseLotSize: u64,
    quoteLotSize: u64,
    marketVaultSignerNonce: u8,
  }),
);

/**
 * # Arguments
 *
 * * `ctx` - The context of accounts
 *
 */
export type MigrateToCpswap = undefined;

/**
 * # Arguments
 *
 * * `ctx` - The context of accounts
 *
 */
export const migrateToCpswap = instruction(
  {
    d8: '0x885cc8671cda908c',
  },
  {
    /**
     * Only migrate_to_cpswap_wallet can migrate to cpswap pool
     * This signer must match the migrate_to_cpswap_wallet saved in global_config
     */
    payer: 0,
    /**
     * The mint for the base token (token being sold)
     */
    baseMint: 1,
    /**
     * The mint for the quote token (token used to buy)
     */
    quoteMint: 2,
    /**
     * Platform configuration account containing platform-wide settings
     * Used to read platform fee rate
     */
    platformConfig: 3,
    cpswapProgram: 4,
    /**
     * PDA account:
     * seeds = [
     * b"pool",
     * cpswap_config.key().as_ref(),
     * token_0_mint.key().as_ref(),
     * token_1_mint.key().as_ref(),
     * ],
     * seeds::program = cpswap_program,
     *
     * Or random account: must be signed by cli
     */
    cpswapPool: 5,
    cpswapAuthority: 6,
    cpswapLpMint: 7,
    cpswapBaseVault: 8,
    cpswapQuoteVault: 9,
    cpswapConfig: 10,
    cpswapCreatePoolFee: 11,
    cpswapObservation: 12,
    lockProgram: 13,
    lockAuthority: 14,
    lockLpVault: 15,
    /**
     * PDA that acts as the authority for pool vault operations
     * Generated using AUTH_SEED
     */
    authority: 16,
    /**
     * Account that stores the pool's state and parameters
     * PDA generated using POOL_SEED and both token mints
     */
    poolState: 17,
    /**
     * Global config account stores owner
     */
    globalConfig: 18,
    /**
     * The pool's vault for base tokens
     * Will be fully drained during migration
     */
    baseVault: 19,
    /**
     * The pool's vault for quote tokens
     * Will be fully drained during migration
     */
    quoteVault: 20,
    poolLpToken: 21,
    /**
     * SPL Token program for the base token
     * Must be the standard Token program
     */
    baseTokenProgram: 22,
    /**
     * SPL Token program for the quote token
     */
    quoteTokenProgram: 23,
    /**
     * Program to create an ATA for receiving fee NFT
     */
    associatedTokenProgram: 24,
    /**
     * Required for account creation
     */
    systemProgram: 25,
    /**
     * Required for rent exempt calculations
     */
    rentProgram: 26,
    /**
     * Program to create NFT metadata accunt
     */
    metadataProgram: 27,
  },
  unit,
);

/**
 * Remove platform launch param
 * # Arguments
 *
 * * `ctx` - The context of accounts
 * * `index` - The index of the curve param to remove
 *
 */
export interface RemovePlatformCurveParam {
  index: number;
}

/**
 * Remove platform launch param
 * # Arguments
 *
 * * `ctx` - The context of accounts
 * * `index` - The index of the curve param to remove
 *
 */
export const removePlatformCurveParam = instruction(
  {
    d8: '0x1b1e3ea95de01891',
  },
  {
    /**
     * The account paying for the initialization costs
     */
    platformAdmin: 0,
    /**
     * Platform config account to be changed
     */
    platformConfig: 1,
  },
  struct({
    index: u8,
  }),
);

/**
 * Use the given amount of base tokens to sell for quote tokens.
 * # Arguments
 *
 * * `ctx` - The context of accounts
 * * `amount_in` - Amount of base token to sell
 * * `minimum_amount_out` - Minimum amount of quote token to receive (slippage protection)
 * * `share_fee_rate` - Fee rate for the share
 *
 */
export interface SellExactIn {
  amountIn: bigint;
  minimumAmountOut: bigint;
  shareFeeRate: bigint;
}

/**
 * Use the given amount of base tokens to sell for quote tokens.
 * # Arguments
 *
 * * `ctx` - The context of accounts
 * * `amount_in` - Amount of base token to sell
 * * `minimum_amount_out` - Minimum amount of quote token to receive (slippage protection)
 * * `share_fee_rate` - Fee rate for the share
 *
 */
export const sellExactIn = instruction(
  {
    d8: '0x9527de9bd37c981a',
  },
  {
    /**
     * The user performing the swap operation
     * Must sign the transaction and pay for fees
     */
    payer: 0,
    /**
     * PDA that acts as the authority for pool vault operations
     * Generated using AUTH_SEED
     */
    authority: 1,
    /**
     * Global configuration account containing protocol-wide settings
     * Used to read protocol fee rates and curve type
     */
    globalConfig: 2,
    /**
     * Platform configuration account containing platform-wide settings
     * Used to read platform fee rate
     */
    platformConfig: 3,
    /**
     * The pool state account where the swap will be performed
     * Contains current pool parameters and balances
     */
    poolState: 4,
    /**
     * The user's token account for base tokens (tokens being bought)
     * Will receive the output tokens after the swap
     */
    userBaseToken: 5,
    /**
     * The user's token account for quote tokens (tokens being sold)
     * Will be debited for the input amount
     */
    userQuoteToken: 6,
    /**
     * The pool's vault for base tokens
     * Will be debited to send tokens to the user
     */
    baseVault: 7,
    /**
     * The pool's vault for quote tokens
     * Will receive the input tokens from the user
     */
    quoteVault: 8,
    /**
     * The mint of the base token
     * Used for transfer fee calculations if applicable
     */
    baseTokenMint: 9,
    /**
     * The mint of the quote token
     */
    quoteTokenMint: 10,
    /**
     * SPL Token program for base token transfers
     */
    baseTokenProgram: 11,
    /**
     * SPL Token program for quote token transfers
     */
    quoteTokenProgram: 12,
    eventAuthority: 13,
    program: 14,
  },
  struct({
    amountIn: u64,
    minimumAmountOut: u64,
    shareFeeRate: u64,
  }),
);

/**
 * Sell base tokens for the given amount of quote tokens.
 * # Arguments
 *
 * * `ctx` - The context of accounts
 * * `amount_out` - Amount of quote token to receive
 * * `maximum_amount_in` - Maximum amount of base token to purchase (slippage protection)
 * * `share_fee_rate` - Fee rate for the share
 *
 */
export interface SellExactOut {
  amountOut: bigint;
  maximumAmountIn: bigint;
  shareFeeRate: bigint;
}

/**
 * Sell base tokens for the given amount of quote tokens.
 * # Arguments
 *
 * * `ctx` - The context of accounts
 * * `amount_out` - Amount of quote token to receive
 * * `maximum_amount_in` - Maximum amount of base token to purchase (slippage protection)
 * * `share_fee_rate` - Fee rate for the share
 *
 */
export const sellExactOut = instruction(
  {
    d8: '0x5fc8472208090ba6',
  },
  {
    /**
     * The user performing the swap operation
     * Must sign the transaction and pay for fees
     */
    payer: 0,
    /**
     * PDA that acts as the authority for pool vault operations
     * Generated using AUTH_SEED
     */
    authority: 1,
    /**
     * Global configuration account containing protocol-wide settings
     * Used to read protocol fee rates and curve type
     */
    globalConfig: 2,
    /**
     * Platform configuration account containing platform-wide settings
     * Used to read platform fee rate
     */
    platformConfig: 3,
    /**
     * The pool state account where the swap will be performed
     * Contains current pool parameters and balances
     */
    poolState: 4,
    /**
     * The user's token account for base tokens (tokens being bought)
     * Will receive the output tokens after the swap
     */
    userBaseToken: 5,
    /**
     * The user's token account for quote tokens (tokens being sold)
     * Will be debited for the input amount
     */
    userQuoteToken: 6,
    /**
     * The pool's vault for base tokens
     * Will be debited to send tokens to the user
     */
    baseVault: 7,
    /**
     * The pool's vault for quote tokens
     * Will receive the input tokens from the user
     */
    quoteVault: 8,
    /**
     * The mint of the base token
     * Used for transfer fee calculations if applicable
     */
    baseTokenMint: 9,
    /**
     * The mint of the quote token
     */
    quoteTokenMint: 10,
    /**
     * SPL Token program for base token transfers
     */
    baseTokenProgram: 11,
    /**
     * SPL Token program for quote token transfers
     */
    quoteTokenProgram: 12,
    eventAuthority: 13,
    program: 14,
  },
  struct({
    amountOut: u64,
    maximumAmountIn: u64,
    shareFeeRate: u64,
  }),
);

/**
 * Updates configuration parameters
 * # Arguments
 *
 * * `ctx` - The context of accounts
 * * `param` - Parameter to update:
 * - 0: Update trade_fee_rate
 * - 1: Update fee owner
 * * `value` - New value for the selected parameter
 *
 */
export interface UpdateConfig {
  param: number;
  value: bigint;
}

/**
 * Updates configuration parameters
 * # Arguments
 *
 * * `ctx` - The context of accounts
 * * `param` - Parameter to update:
 * - 0: Update trade_fee_rate
 * - 1: Update fee owner
 * * `value` - New value for the selected parameter
 *
 */
export const updateConfig = instruction(
  {
    d8: '0x1d9efcbf0a53db63',
  },
  {
    /**
     * The global config owner or admin
     */
    owner: 0,
    /**
     * Global config account to be changed
     */
    globalConfig: 1,
  },
  struct({
    param: u8,
    value: u64,
  }),
);

/**
 * Update platform config
 * # Arguments
 *
 * * `ctx` - The context of accounts
 * * `param` - Parameter to update
 *
 */
export interface UpdatePlatformConfig {
  param: PlatformConfigParam;
}

/**
 * Update platform config
 * # Arguments
 *
 * * `ctx` - The context of accounts
 * * `param` - Parameter to update
 *
 */
export const updatePlatformConfig = instruction(
  {
    d8: '0xc33c4c81922d438f',
  },
  {
    /**
     * The account paying for the initialization costs
     */
    platformAdmin: 0,
    /**
     * Platform config account to be changed
     */
    platformConfig: 1,
  },
  struct({
    param: PlatformConfigParam,
  }),
);

/**
 * Update platform launch param
 * # Arguments
 *
 * * `ctx` - The context of accounts
 * * `bonding_curve_param` - Parameter to update
 *
 */
export interface UpdatePlatformCurveParam {
  index: number;
  bondingCurveParam: BondingCurveParam;
}

/**
 * Update platform launch param
 * # Arguments
 *
 * * `ctx` - The context of accounts
 * * `bonding_curve_param` - Parameter to update
 *
 */
export const updatePlatformCurveParam = instruction(
  {
    d8: '0x8a908afadc800439',
  },
  {
    /**
     * The account paying for the initialization costs
     */
    platformAdmin: 0,
    /**
     * Platform config account to be changed
     */
    platformConfig: 1,
    /**
     * Global configuration account containing protocol-wide settings
     * Includes settings like quote token mint and fee parameters
     */
    globalConfig: 2,
    /**
     * System program for lamport transfers
     */
    systemProgram: 3,
  },
  struct({
    index: u8,
    bondingCurveParam: BondingCurveParam,
  }),
);
