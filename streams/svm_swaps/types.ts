import { FieldSelection } from '@subsquid/solana-stream';
import type * as PortalData from '@subsquid/solana-normalization';
import { BlockRef } from '@sqd-pipes/core';

type WithPickedFields<
  Selection extends FieldSelection,
  K extends keyof Selection,
  FullDataType
> = Pick<FullDataType, keyof Selection[K] & keyof FullDataType>;

export type PartialInstruction<Selection extends FieldSelection> =
  WithPickedFields<Selection, 'instruction', PortalData.Instruction>;

export type PartialBlock<Selection extends FieldSelection> = {
  header: WithPickedFields<Selection, 'block', PortalData.BlockHeader>;
  transactions: WithPickedFields<
    Selection,
    'transaction',
    PortalData.Transaction
  >[];
  instructions: PartialInstruction<Selection>[];
  logs: WithPickedFields<Selection, 'log', PortalData.LogMessage>[];
  tokenBalances: WithPickedFields<
    Selection,
    'tokenBalance',
    PortalData.TokenBalance
  >[];
};

export interface TokenAmount {
  amount: bigint;
  mint: string;
  decimals: number;
}

// Block / Instruction representation compatible with different utility functions
export type Block = PartialBlock<{
  block: {
    number: true;
    hash: true;
    timestamp: true;
  };
  transaction: {
    transactionIndex: true;
    signatures: true;
    accountKeys: true;
    loadedAddresses: true;
  };
  instruction: {
    transactionIndex: true;
    data: true;
    instructionAddress: true;
    programId: true;
    accounts: true;
  };
  tokenBalance: {
    transactionIndex: true;
    account: true;
    preMint: true;
    postMint: true;
    preAmount: true;
    postAmount: true;
    preDecimals: true;
    postDecimals: true;
  };
  log: {
    transactionIndex: true;
    instructionAddress: true;
    message: true;
    logIndex: true;
  };
}>;
export type Instruction = Block['instructions'][number];

export interface DecodedTransfer {
  accounts: {
    destination: string;
    source: string;
    authority?: string;
    owner?: string;
  };
  data: {
    amount: bigint;
  };
}

export type SolanaTokenMintData = {
  // Token mint account
  mintAcc: string;
  // Number of decimals for the token
  decimals: number;
  // Timestamp of token creation
  createdAt?: string;
  // Number of the block in which the token was created
  createdAtBlock?: number;
  // Hash of the token creation transaction
  creationTxHash?: string;
};

export type SolanaTokenMetadata = {
  // Token metadata account
  metadataAcc: string;
  // Token mint account
  mintAcc: string;
  // Name of the token
  name: string;
  // Symbol of the token
  symbol: string;
  // Uri to additional metadata
  // uri: string;
  // Metadata mutability (0 = non-mutable)
  mutable: number;
};

export type SolanaTokenMetadataUpdate = {
  // Token metadata account
  metadataAcc: string;
  // Updated name of the token
  name?: string;
  // Updated symbol of the token
  symbol?: string;
  // Updated uri to additional metadata
  uri?: string;
};

export type SolanaToken = SolanaTokenMintData & Partial<SolanaTokenMetadata>;

export type SwappedTokenData = SolanaToken & {
  amount: bigint;
  reserves: bigint;
};

export type SwapType =
  | 'orca_whirlpool'
  | 'meteora_damm'
  | 'meteora_dlmm'
  | 'raydium_clmm'
  | 'raydium_amm'
  | 'raydium_launchlab';

export type SolanaSwapCore = {
  // Dex where the swap occurred
  type: SwapType;
  // Account which executed the swap
  account: string;
  // Swap's input token data
  input: SwappedTokenData;
  // Swap's output token data
  output: SwappedTokenData;
  // Address of the pool
  poolAddress: string;
  // TODO: `slippage` is nullable, because it's not implemented yet for Meteora.
  // Once implemented the value should be required.
  slippage: number | null;
};

export type SolanaSwap = SolanaSwapCore & {
  id: string;
  // Transaction identification
  transaction: { hash: string; index: number };
  // Instruction identifier
  instruction: { address: number[] };
  // Block identifier
  block: BlockRef;
  // Transaction timestamp
  timestamp: Date;
};

// Ref: https://github.com/raydium-io/raydium-sdk-V2/blob/4e4699ee9161e615ae5a1a557329a9fbd39d8a71/src/raydium/launchpad/curve/curve.ts#L479
export enum LaunchLabCurveType {
  ConstantProduct = 0,
  FixedPrice = 1,
  Linear = 2,
}

export type LaunchLabConfig = {
  account: string;
  curveType: LaunchLabCurveType;
};
