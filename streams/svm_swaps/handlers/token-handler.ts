import * as token from '../contracts/token-program';
import * as token2022 from '../contracts/token-2022-program';
import { Instruction, SolanaTokenMintData } from '../types';
import { getInstructionD1, getTransactionHash } from '../utils';
import { SwapStreamInstructionHandler } from '../solana-swap-stream.types';

export const tokenProgramIds = [token.programId, token2022.programId];

export const initializeMintInstructions = [
  token.instructions.initializeMint,
  token.instructions.initializeMint2,
  token2022.instructions.initializeMint,
  token2022.instructions.initializeMint2,
];

export const mintInstructions = [
  token.instructions.mintTo,
  token.instructions.mintToChecked,
  token2022.instructions.mintTo,
  token2022.instructions.mintTo,
];

export const burnInstructions = [
  token.instructions.burn,
  token.instructions.burnChecked,
  token2022.instructions.burn,
  token2022.instructions.burnChecked,
];

export function decodeInitializeMint(ins: Instruction) {
  const codec = initializeMintInstructions.find((i) => i.d1 === getInstructionD1(ins));
  if (!codec) {
    throw new Error(`Unrecognized initialize mint instruction`);
  }
  return codec.decode(ins);
}

export function decodeMintInstruction(ins: Instruction) {
  const codec = mintInstructions.find((i) => i.d1 === getInstructionD1(ins));
  if (!codec) {
    throw new Error(`Unrecognized mint instruction`);
  }
  return codec.decode(ins);
}

export function decodeBurnInstruction(ins: Instruction) {
  const codec = burnInstructions.find((i) => i.d1 === getInstructionD1(ins));
  if (!codec) {
    throw new Error(`Unrecognized burn instruction`);
  }
  return codec.decode(ins);
}

export const initializeMintHandler: SwapStreamInstructionHandler = {
  check: ({ ins }) =>
    tokenProgramIds.includes(ins.programId) &&
    initializeMintInstructions.some((i) => i.d1 === getInstructionD1(ins)),
  run: ({ ins, block, context }) => {
    const md = decodeInitializeMint(ins);
    const mintData: SolanaTokenMintData = {
      mintAcc: md.accounts.mint,
      decimals: md.data.decimals,
      createdAt: new Date(block.header.timestamp * 1000).toISOString(),
      createdAtBlock: block.header.number,
      creationTxHash: getTransactionHash(ins, block),
    };
    context.storage.tokens.handleNew(mintData, !context.onlyMeta);
  },
};

export const mintHandler: SwapStreamInstructionHandler = {
  check: ({ ins }) =>
    tokenProgramIds.includes(ins.programId) &&
    mintInstructions.some((i) => i.d1 === getInstructionD1(ins)),
  run: ({ ins, context }) => {
    const md = decodeMintInstruction(ins);
    context.storage.tokens.handleUpdateTokensIssuance(
      'mint' in md.accounts ? md.accounts.mint : md.accounts.tokenMint,
      md.data.amount,
    );
  },
};

export const burnHandler: SwapStreamInstructionHandler = {
  check: ({ ins }) =>
    tokenProgramIds.includes(ins.programId) &&
    burnInstructions.some((i) => i.d1 === getInstructionD1(ins)),
  run: ({ ins, context }) => {
    const md = decodeBurnInstruction(ins);
    context.storage.tokens.handleUpdateTokensIssuance(
      'mint' in md.accounts ? md.accounts.mint : md.accounts.tokenMint,
      -md.data.amount,
    );
  },
};
