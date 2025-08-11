import * as token from '../contracts/token-program';
import * as token2022 from '../contracts/token-2022-program';
import { Instruction, SolanaTokenMintData, Block } from '../types';
import { getInstructionD1, getTransactionHash } from '../utils';

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

export function isInitializeMintInstruction(ins: Instruction) {
  return (
    tokenProgramIds.includes(ins.programId) &&
    initializeMintInstructions.some((i) => i.d1 === getInstructionD1(ins))
  );
}

export function isMintInstruction(ins: Instruction) {
  return (
    tokenProgramIds.includes(ins.programId) &&
    mintInstructions.some((i) => i.d1 === getInstructionD1(ins))
  );
}

export function isBurnInstruction(ins: Instruction) {
  return (
    tokenProgramIds.includes(ins.programId) &&
    burnInstructions.some((i) => i.d1 === getInstructionD1(ins))
  );
}

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

export function handleInitializeMint(block: Block, ins: Instruction): SolanaTokenMintData {
  const md = decodeInitializeMint(ins);
  return {
    mintAcc: md.accounts.mint,
    decimals: md.data.decimals,
    createdAt: new Date(block.header.timestamp * 1000).toISOString(),
    createdAtBlock: block.header.number,
    creationTxHash: getTransactionHash(ins, block),
  };
}

export function handleMint(ins: Instruction) {
  const md = decodeMintInstruction(ins);
  return {
    mintAcc: 'mint' in md.accounts ? md.accounts.mint : md.accounts.tokenMint,
    amount: md.data.amount,
  };
}

export function handleBurn(ins: Instruction) {
  const md = decodeBurnInstruction(ins);
  return {
    mintAcc: 'mint' in md.accounts ? md.accounts.mint : md.accounts.tokenMint,
    amount: md.data.amount,
  };
}
