import { Logger } from 'pino';
import { MetadataStorage } from './storage/metadata-storage';
import { InstructionHandler, PartialBlock, PartialInstruction, SolanaSwapCore } from '../types';

export const swapStreamFieldsSelection = {
  block: {
    number: true,
    hash: true,
    timestamp: true,
  },
  transaction: {
    transactionIndex: true,
    signatures: true,
    accountKeys: true,
    loadedAddresses: true,
  },
  instruction: {
    transactionIndex: true,
    data: true,
    instructionAddress: true,
    programId: true,
    accounts: true,
  },
  tokenBalance: {
    transactionIndex: true,
    account: true,
    preMint: true,
    postMint: true,
    preAmount: true,
    postAmount: true,
    preDecimals: true,
    postDecimals: true,
  },
  log: {
    transactionIndex: true,
    instructionAddress: true,
    message: true,
    logIndex: true,
  },
};

export type SwapStreamBlock = PartialBlock<typeof swapStreamFieldsSelection>;
export type SwapStreamInstruction = PartialInstruction<typeof swapStreamFieldsSelection>;

export type SwapStreamInstructionHandler = InstructionHandler<
  SwapStreamBlock,
  SwapStreamInstruction,
  { logger: Logger; storage: MetadataStorage; onlyMeta: boolean },
  SolanaSwapCore | null | void
>;
