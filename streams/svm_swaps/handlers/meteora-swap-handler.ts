import type { Logger } from '@sqd-pipes/core';
import {
  getInnerInstructions,
  getInnerTransfersByLevel,
  getInstructionBalances,
  getInstructionD1,
  getPostTokenBalance,
  getTransactionHash,
} from '../utils';
import * as tokenProgram from '../contracts/token-program';
import { Block, Instruction, SolanaSwapCore } from '../types';

export function handleMeteoraDamm(
  logger: Logger,
  ins: Instruction,
  block: Block
): SolanaSwapCore | null {
  /**
   * Meteora DAMM has two transfers on the second level and also other tokenProgram instructions
   */
  const transfers = getInnerInstructions(ins, block.instructions)
    .filter((inner) => {
      return getInstructionD1(inner) === tokenProgram.instructions.transfer.d1;
    })
    .map((t) => {
      return tokenProgram.instructions.transfer.decode(t);
    });

  // DAMM could have internal transfers, the last two transfers are final src and dest
  const [src, dest] = transfers.slice(-2);
  if (!src || !dest) {
    logger.warn({
      message: 'Meteora DAMM: src or dest not found',
      tx: getTransactionHash(ins, block),
      block_number: block.header.number,
      src,
      dest,
    });

    return null;
  }

  const tokenBalances = getInstructionBalances(ins, block);
  const tokenIn = getPostTokenBalance(tokenBalances, src.accounts.destination);
  const tokenOut = getPostTokenBalance(tokenBalances, dest.accounts.source);
  return {
    type: 'meteora_damm',
    account: src.accounts.authority,
    input: {
      amount: src.data.amount,
      mintAcc: tokenIn.postMint,
      decimals: tokenIn.postDecimals,
    },
    output: {
      amount: dest.data.amount,
      mintAcc: tokenOut.postMint,
      decimals: tokenOut.postDecimals,
    },
    poolAddress: null,
    slippage: null,
  };
}

export function handleMeteoraDlmm(
  ins: Instruction,
  block: Block
): SolanaSwapCore {
  const transfers = getInnerTransfersByLevel(ins, block.instructions, 1).map(
    (t) => {
      return tokenProgram.instructions.transferChecked.decode(t);
    }
  );

  // DLMM could have internal transfers, the last two transfers are final src and dest
  // TODO if there are more than 2 transfers, is the first one fee?
  // 2fsnqWFXfmPkNPMTe2BVrDgSEhgezDTtvXxedrDHJrrLXNWR7K2DpPZ13N2DppGrYmTpofAfToXzaqyBWiumJGZ4
  const [src, dest] = transfers.slice(-2);
  const tokenBalances = getInstructionBalances(ins, block);

  const tokenIn = getPostTokenBalance(tokenBalances, src.accounts.destination);
  const tokenOut = getPostTokenBalance(tokenBalances, dest.accounts.source);
  return {
    type: 'meteora_dlmm',
    account: src.accounts.owner,
    input: {
      amount: src.data.amount,
      mintAcc: tokenIn.postMint,
      decimals: tokenIn.postDecimals,
    },
    output: {
      amount: dest.data.amount,
      mintAcc: tokenOut.postMint,
      decimals: tokenOut.postDecimals,
    },
    poolAddress: null,
    slippage: null,
  };
}
