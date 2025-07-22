import type { Logger } from '@sqd-pipes/core';
import {
  getInnerInstructions,
  getInnerTransfersByLevel,
  getInstructionBalances,
  getInstructionD1,
  getPostTokenBalance,
  getPreTokenBalance,
  getTransactionHash,
} from '../utils';
import * as tokenProgram from '../contracts/token-program';
import * as meteoraDlmm from '../contracts/meteora-dlmm';
import * as meteoraDamm from '../contracts/meteora-damm';
import { Block, Instruction, SolanaSwapCore } from '../types';
import { getInstructionDescriptor } from '@subsquid/solana-stream';
import { assert } from 'console';
import { DecodedInstruction } from '../contracts/abi.support';

function decodeMeteoraDlmmSwapIns(ins: Instruction) {
  switch (getInstructionDescriptor(ins)) {
    case meteoraDlmm.instructions.swap.d8:
      return meteoraDlmm.instructions.swap.decode(ins);
    case meteoraDlmm.instructions.swapExactOut.d8:
      return meteoraDlmm.instructions.swapExactOut.decode(ins);
    default:
      throw new Error('Unrecognized Meteora DLMM Swap instruction');
  }
}

function decodeMeteoraDammSwapIns(ins: Instruction) {
  switch (getInstructionDescriptor(ins)) {
    case meteoraDamm.instructions.swap.d8:
      return meteoraDamm.instructions.swap.decode(ins);
    default:
      throw new Error('Unrecognized Meteora DAMM Swap instruction');
  }
}

function validateAccounts(
  srcTransfer: DecodedInstruction<
    { source: string; destination: string },
    unknown
  >,
  destTransfer: DecodedInstruction<
    { source: string; destination: string },
    unknown
  >,
  userIn: string,
  userOut: string,
  reserveIn: string,
  reserveOut: string,
  txHash: string
) {
  assert(
    srcTransfer.accounts.source === userIn,
    `Invalid Meteora DLMM input account. Tx: ${txHash}`
  );
  assert(
    destTransfer.accounts.destination === userOut,
    `Invalid Meteora DLMM output account. Tx: ${txHash}`
  );
  assert(
    srcTransfer.accounts.destination === reserveIn,
    `Invalid Meteora DLMM input reserve account. Tx: ${txHash}`
  );
  assert(
    destTransfer.accounts.source === reserveOut,
    `Invalid Meteora DLMM output reserve account. Tx: ${txHash}`
  );
}

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

  const {
    pool,
    userSourceToken,
    userDestinationToken,
    aTokenVault,
    bTokenVault,
  } = decodeMeteoraDammSwapIns(ins).accounts;

  const tokenAIsInput = src.accounts.destination === aTokenVault;
  const reserveInAcc = tokenAIsInput ? aTokenVault : bTokenVault;
  const reserveOutAcc = tokenAIsInput ? bTokenVault : aTokenVault;

  // Sanity checks
  validateAccounts(
    src,
    dest,
    userSourceToken,
    userDestinationToken,
    reserveInAcc,
    reserveOutAcc,
    getTransactionHash(ins, block)
  );

  const { preAmount: reserveInAmount } = getPreTokenBalance(
    tokenBalances,
    reserveInAcc
  );
  const { preAmount: reserveOutAmount } = getPreTokenBalance(
    tokenBalances,
    reserveOutAcc
  );

  return {
    type: 'meteora_damm',
    account: src.accounts.authority,
    input: {
      amount: src.data.amount,
      mintAcc: tokenIn.postMint,
      decimals: tokenIn.postDecimals,
      reserves: reserveInAmount,
    },
    output: {
      amount: dest.data.amount,
      mintAcc: tokenOut.postMint,
      decimals: tokenOut.postDecimals,
      reserves: reserveOutAmount,
    },
    poolAddress: pool,
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

  const {
    lbPair: poolAddress,
    tokenXMint,
    reserveX,
    reserveY,
    userTokenIn,
    userTokenOut,
  } = decodeMeteoraDlmmSwapIns(ins).accounts;

  const tokenXIsInput = tokenIn.postMint === tokenXMint;
  const reserveInAcc = tokenXIsInput ? reserveX : reserveY;
  const reserveOutAcc = tokenXIsInput ? reserveY : reserveX;

  // Sanity checks
  validateAccounts(
    src,
    dest,
    userTokenIn,
    userTokenOut,
    reserveInAcc,
    reserveOutAcc,
    getTransactionHash(ins, block)
  );

  const { preAmount: reserveInAmount } = getPreTokenBalance(
    tokenBalances,
    reserveInAcc
  );
  const { preAmount: reserveOutAmount } = getPreTokenBalance(
    tokenBalances,
    reserveOutAcc
  );

  return {
    type: 'meteora_dlmm',
    account: src.accounts.owner,
    input: {
      amount: src.data.amount,
      mintAcc: tokenIn.postMint,
      decimals: tokenIn.postDecimals,
      reserves: reserveInAmount,
    },
    output: {
      amount: dest.data.amount,
      mintAcc: tokenOut.postMint,
      decimals: tokenOut.postDecimals,
      reserves: reserveOutAmount,
    },
    poolAddress,
    slippage: null,
  };
}
