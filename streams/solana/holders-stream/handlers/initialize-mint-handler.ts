import * as token from '../../contracts/token-program';
import * as token2022 from '../../contracts/token-2022-program';
import { Block, Instruction, SolanaTokenMintData } from '../../types';
import { getInstructionD1, getTransactionHash } from '../../utils';

export const isInitializeMintInstruction = (ins: Instruction): boolean => {
  const desc = getInstructionD1(ins);

  if (ins.programId === token.programId) {
    return (
      desc === token.instructions.initializeMint.d1 ||
      desc === token.instructions.initializeMint2.d1
    );
  }

  if (ins.programId === token2022.programId) {
    return (
      desc === token2022.instructions.initializeMint.d1 ||
      desc === token2022.instructions.initializeMint2.d1
    );
  }

  return false;
};

export function decodeInitializeMint(ins: Instruction) {
  const d1 = getInstructionD1(ins);

  if (ins.programId === token.programId) {
    switch (d1) {
      case token.instructions.initializeMint.d1:
        return token.instructions.initializeMint.decode(ins);
      case token.instructions.initializeMint2.d1:
        return token.instructions.initializeMint2.decode(ins);
    }
  }

  if (ins.programId === token2022.programId) {
    switch (d1) {
      case token2022.instructions.initializeMint.d1:
        return token2022.instructions.initializeMint.decode(ins);
      case token2022.instructions.initializeMint2.d1:
        return token2022.instructions.initializeMint2.decode(ins);
    }
  }

  // If we reach here, the instruction is not recognized for initializing a mint
  throw new Error('Unrecognized instruction for initializing mint');
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
