import {
  getDecodedInnerTransfers,
  getInstructionBalances,
  getPreTokenBalance,
  getTokenInfoFromTransfer,
  getTransactionHash,
} from '../../utils';
import * as meteoraDlmm from '../../contracts/meteora-dlmm';
import * as meteoraDamm from '../../contracts/meteora-damm';
import { DecodedTransfer, Instruction } from '../../types';
import { getInstructionDescriptor } from '@subsquid/solana-stream';
import assert from 'node:assert';
import { SwapStreamInstructionHandler } from '../types';

export const dlmmSwapInstructions = [
  meteoraDlmm.instructions.swap,
  meteoraDlmm.instructions.swapExactOut,
];

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

function findInputTransfer(
  transfers: DecodedTransfer[],
  userInAccount: string,
  // Pass an array if there is more than 1 possible inTokenVault
  inTokenVault: string | string[],
): DecodedTransfer {
  const possibleInTokenVaults = Array.isArray(inTokenVault) ? inTokenVault : [inTokenVault];
  const candidates = transfers.filter(
    (t) =>
      t.accounts.source === userInAccount && possibleInTokenVaults.includes(t.accounts.destination),
  );
  if (candidates.length !== 1) {
    throw new Error(`Unexpected number of possible swap input transfers: ${candidates.length}`);
  }
  return candidates[0];
}

function findOutputTransfer(
  transfers: DecodedTransfer[],
  userOutAccount: string,
  outTokenVault: string,
): DecodedTransfer | null {
  const candidates = transfers.filter(
    (t) => t.accounts.source === outTokenVault && t.accounts.destination === userOutAccount,
  );
  if (candidates.length > 1) {
    throw new Error(`Unexpected number of possible swap output transfers: ${candidates.length}`);
  }
  return candidates[0] || null;
}

export const dammSwapHandler: SwapStreamInstructionHandler = {
  check: ({ ins }) =>
    ins.programId === meteoraDamm.programId &&
    meteoraDamm.instructions.swap.d8 === getInstructionDescriptor(ins),
  run: ({ ins, block, context: { logger } }) => {
    const decodedIns = decodeMeteoraDammSwapIns(ins);
    const { pool, userSourceToken, userDestinationToken, aTokenVault, bTokenVault } =
      decodedIns.accounts;
    const transfers = getDecodedInnerTransfers(ins, block, null);
    const inputTransfer = findInputTransfer(transfers, userSourceToken, [aTokenVault, bTokenVault]);
    const tokenAIsInput = inputTransfer.accounts.destination === aTokenVault;
    const reserveInAcc = tokenAIsInput ? aTokenVault : bTokenVault;
    const reserveOutAcc = tokenAIsInput ? bTokenVault : aTokenVault;
    const outputTransfer = findOutputTransfer(transfers, userDestinationToken, reserveOutAcc);

    if (!outputTransfer) {
      if (!decodedIns.data.minimumOutAmount) {
        // Can sometimes be empty as evidenced by:
        // 3es2ore2VRSbA1PmuJ4aSnkijovVm9pEAbFjsFyey4UUsr3K5ejTw3XGUsN9E2vVGEzcjN6vn2GYKdR8C2CcPLTx
        logger.warn({ tx: getTransactionHash(ins, block) }, `Meteora DAMM: No output transfer`);
      } else {
        throw new Error(`Meteora DAMM: Missing output transfer`);
      }
      return null;
    }

    const tokenBalances = getInstructionBalances(ins, block);

    const tokenInInfo = getTokenInfoFromTransfer(tokenBalances, inputTransfer);
    const tokenOutInfo = getTokenInfoFromTransfer(tokenBalances, outputTransfer);

    const { preAmount: reserveInAmount } = getPreTokenBalance(tokenBalances, reserveInAcc);
    const { preAmount: reserveOutAmount } = getPreTokenBalance(tokenBalances, reserveOutAcc);

    assert(
      inputTransfer.accounts.authority,
      'Meteora DAMM: Missing input transfer authority account',
    );

    return {
      type: 'meteora_damm',
      account: inputTransfer.accounts.authority,
      input: {
        amount: inputTransfer.data.amount,
        mintAcc: tokenInInfo.mint,
        decimals: tokenInInfo.decimals,
        reserves: reserveInAmount,
      },
      output: {
        amount: outputTransfer.data.amount,
        mintAcc: tokenOutInfo.mint,
        decimals: tokenOutInfo.decimals,
        reserves: reserveOutAmount,
      },
      poolAddress: pool,
      slippagePct: null,
    };
  },
};

export const dlmmSwapHandler: SwapStreamInstructionHandler = {
  check: ({ ins }) =>
    ins.programId === meteoraDlmm.programId &&
    dlmmSwapInstructions.map(({ d8 }) => d8).includes(getInstructionDescriptor(ins)),
  run: ({ ins, block }) => {
    const decodedIns = decodeMeteoraDlmmSwapIns(ins);
    const {
      lbPair: poolAddress,
      tokenXMint,
      tokenYMint,
      reserveX,
      reserveY,
      userTokenIn,
      userTokenOut,
    } = decodedIns.accounts;
    const transfers = getDecodedInnerTransfers(ins, block);
    const inputTransfer = findInputTransfer(transfers, userTokenIn, [reserveX, reserveY]);
    const tokenXIsInput = inputTransfer.accounts.destination === reserveX;
    const reserveInAcc = tokenXIsInput ? reserveX : reserveY;
    const reserveOutAcc = tokenXIsInput ? reserveY : reserveX;
    const tokenInMint = tokenXIsInput ? tokenXMint : tokenYMint;
    const tokenOutMint = tokenXIsInput ? tokenYMint : tokenXMint;
    const outputTransfer = findOutputTransfer(transfers, userTokenOut, reserveOutAcc);

    if (!outputTransfer) {
      // FIXME: Unclear whether it's possible
      throw new Error(`Meteora DLMM: Missing output transfer`);
    }

    const tokenBalances = getInstructionBalances(ins, block);

    const tokenInInfo = getTokenInfoFromTransfer(tokenBalances, inputTransfer);
    const tokenOutInfo = getTokenInfoFromTransfer(tokenBalances, outputTransfer);

    if (tokenInInfo.mint !== tokenInMint) {
      throw new Error(
        `Meteora DLMM: Inconsistent input token mint: ${tokenInInfo.mint} vs ${tokenInMint}`,
      );
    }

    if (tokenOutInfo.mint !== tokenOutMint) {
      throw new Error(
        `Meteora DLMM: Inconsistent output token mint: ${tokenOutInfo.mint} vs ${tokenOutMint}`,
      );
    }

    const { preAmount: reserveInAmount } = getPreTokenBalance(tokenBalances, reserveInAcc);
    const { preAmount: reserveOutAmount } = getPreTokenBalance(tokenBalances, reserveOutAcc);

    assert(inputTransfer.accounts.owner, 'Meteora DAMM: Missing input transfer owner account');

    return {
      type: 'meteora_dlmm',
      account: inputTransfer.accounts.owner,
      input: {
        amount: inputTransfer.data.amount,
        mintAcc: tokenInInfo.mint,
        decimals: tokenInInfo.decimals,
        reserves: reserveInAmount,
      },
      output: {
        amount: outputTransfer.data.amount,
        mintAcc: tokenOutInfo.mint,
        decimals: tokenOutInfo.decimals,
        reserves: reserveOutAmount,
      },
      poolAddress,
      slippagePct: null,
    };
  },
};
