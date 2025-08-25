import assert from 'node:assert';
import * as tokenProgram from '../../contracts/token-program';
import * as whirlpool from '../../contracts/orca-whirlpool';
import {
  getInnerTransfersByLevel,
  getInstructionBalances,
  getInstructionLogs,
  getPostTokenBalance,
  sqrtPriceX64ToPrice,
  getTokenReserves,
  getTransactionHash,
  createGetProgramVersionFunc,
} from '../../utils';
import { PostTokenBalance } from '@subsquid/solana-normalization';
import { getInstructionDescriptor } from '@subsquid/solana-stream';
import type { Traded } from '../../contracts/orca-whirlpool/v1/types';
import { Block, Instruction } from '../../types';
import { SwapStreamInstructionHandler } from '../types';

const getVersion = createGetProgramVersionFunc<whirlpool.Version>(
  whirlpool.VERSIONS,
  'Orca Whirlpool',
);

export const whirlpoolSwapHandler: SwapStreamInstructionHandler = {
  check: ({ ins }) =>
    ins.programId === whirlpool.programId &&
    // Swap instruction is the same in v1 and v2
    whirlpool.v1.instructions.swap.d8 === getInstructionDescriptor(ins),
  run: ({ ins, block }) => {
    const version = getVersion(ins, block);
    const swapEvent = getSwapEvent(ins, block, version);
    const [
      {
        accounts: { destination: tokenInAccount, authority },
        data: { amount: inputTokenAmount },
      },
      {
        accounts: { source: tokenOutAccount },
        data: { amount: outputTokenAmount },
      },
    ] = getInnerTransfersByLevel(ins, block.instructions, 1).map((t) =>
      tokenProgram.instructions.transfer.decode(t),
    );
    const tokenBalances = getInstructionBalances(ins, block);
    const tokenIn = getPostTokenBalance(tokenBalances, tokenInAccount);
    const tokenOut = getPostTokenBalance(tokenBalances, tokenOutAccount);

    const swapPrice =
      tokenIn && tokenOut && swapEvent ? getPoolPrice(swapEvent, tokenIn, tokenOut) : null;

    const slippagePct =
      tokenIn && tokenOut && swapPrice && swapEvent
        ? getSlippage(tokenIn, tokenOut, inputTokenAmount, outputTokenAmount, swapEvent, swapPrice)
        : null;

    const { whirlpool: poolAddress, tokenVaultA, tokenVaultB } = getPoolAccounts(ins, version);

    const reserves = getTokenReserves(ins, block, [tokenVaultA, tokenVaultB]);
    const reserveIn = reserves[tokenIn.postMint];
    const reserveOut = reserves[tokenOut.postMint];
    assert(
      reserveIn !== undefined,
      `Orca: Missing input reserve. Tx hash: ${getTransactionHash(ins, block)}`,
    );
    assert(
      reserveOut !== undefined,
      `Orca: Missing output reserve. Tx hash: ${getTransactionHash(ins, block)}`,
    );

    return {
      type: 'orca_whirlpool',
      poolAddress,
      account: authority,
      input: {
        amount: inputTokenAmount,
        mintAcc: tokenIn.postMint,
        decimals: tokenIn.postDecimals,
        reserves: reserveIn,
      },
      output: {
        amount: outputTokenAmount,
        mintAcc: tokenOut.postMint,
        decimals: tokenOut.postDecimals,
        reserves: reserveOut,
      },
      slippagePct,
    };
  },
};

function getPoolPrice(swapEvent: Traded, tokenIn: PostTokenBalance, tokenOut: PostTokenBalance) {
  const sqrtPrice = swapEvent.preSqrtPrice;
  const tokenADecimals = swapEvent.aToB ? tokenIn.postDecimals : tokenOut.postDecimals;
  const tokenBDecimals = swapEvent.aToB ? tokenOut.postDecimals : tokenIn.postDecimals;

  if (tokenADecimals === undefined || tokenBDecimals === undefined) {
    console.error('No token decimals found');
    return null;
  }
  const poolPrice = sqrtPriceX64ToPrice(sqrtPrice, tokenADecimals, tokenBDecimals);

  return poolPrice;
}

// Calculate slippage based on the pre-swap price and the amount of tokens received
function getSlippage(
  tokenIn: PostTokenBalance,
  tokenOut: PostTokenBalance,
  inputTokenAmount: bigint,
  outputTokenAmount: bigint,
  swapEvent: Traded,
  poolPrice: number,
): number {
  const inputAmount = Number(inputTokenAmount) / 10 ** tokenIn.postDecimals;
  const expectedAmount = swapEvent.aToB ? inputAmount * poolPrice : inputAmount / poolPrice;
  const actualAmount = Number(outputTokenAmount) / 10 ** tokenOut.postDecimals;
  const slippage = ((expectedAmount - actualAmount) / expectedAmount) * 100;

  return slippage;
}

function getSwapEvent(ins: Instruction, block: Block, version?: whirlpool.Version): Traded | null {
  version = version || getVersion(ins, block);
  const logs = getInstructionLogs(ins, block);
  if (logs.length > 1) {
    const hex = Buffer.from(logs[1].message, 'base64').toString('hex');
    // FIXME: Decoding fails on some blocks earlier than 345246630 in some cases, investigate why
    return whirlpool[version].events.Traded.decode({ msg: `0x${hex}` });
  }

  return null;
}

function getPoolAccounts(ins: Instruction, version: whirlpool.Version) {
  const descriptor = getInstructionDescriptor(ins);
  if (descriptor === whirlpool[version].instructions.swap.d8) {
    return whirlpool[version].instructions.swap.decode(ins).accounts;
  }

  return whirlpool[version].instructions.swapV2.decode(ins).accounts;
}
