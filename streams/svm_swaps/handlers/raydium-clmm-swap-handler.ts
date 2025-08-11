import { type TokenBalance, getInstructionDescriptor } from '@subsquid/solana-stream';
import {
  getDecodedInnerTransfers,
  getInstructionBalances,
  getInstructionLogs,
  getPostTokenBalance,
  getPreTokenBalance,
  sqrtPriceX64ToPrice,
} from '../utils';
import * as raydiumClmm from '../contracts/raydium-clmm';
import type { SwapEvent } from '../contracts/raydium-clmm/types';
import { Block, Instruction, SolanaSwapCore } from '../types';

export function handleRaydiumClmm(ins: Instruction, block: Block): SolanaSwapCore {
  const {
    accounts: { poolState: poolAddress, inputVault, outputVault },
  } = decodeSwap(ins);
  const swapEvent = getSwapEvent(ins, block);
  const decodedTransfers = getDecodedInnerTransfers(ins, block);
  if (decodedTransfers.length < 2) {
    throw new Error('Expected 2 decoded transfers accounting for tokenIn and tokenOut');
  }

  const [
    {
      // Transfer instructions take in authority account while TransferChecked instructions take in owner account
      accounts: { destination: tokenInAccount, authority, owner },
      data: { amount: inputTokenAmount },
    },
    {
      accounts: { source: tokenOutAccount },
      data: { amount: outputTokenAmount },
    },
  ] = decodedTransfers;

  const account = authority || owner;
  if (!account) {
    throw new Error('Account not found in transfer instruction');
  }

  const tokenBalances = getInstructionBalances(ins, block);
  const tokenIn = getPostTokenBalance(tokenBalances, tokenInAccount);
  const tokenOut = getPostTokenBalance(tokenBalances, tokenOutAccount);

  const swapPrice = swapEvent ? getPoolPrice(swapEvent, tokenIn, tokenOut) : null;

  const slippagePct =
    tokenIn && tokenOut && swapPrice && swapEvent
      ? getSlippage(tokenIn, tokenOut, inputTokenAmount, outputTokenAmount, swapEvent, swapPrice)
      : null;

  // Get vault tokens to determine token mints
  const inputVaultToken = getPreTokenBalance(tokenBalances, inputVault);
  const outputVaultToken = getPreTokenBalance(tokenBalances, outputVault);
  return {
    type: 'raydium_clmm',
    poolAddress,
    account,
    input: {
      amount: inputTokenAmount,
      mintAcc: tokenIn.postMint,
      decimals: tokenIn.postDecimals,
      reserves: inputVaultToken.preAmount,
    },
    output: {
      amount: outputTokenAmount,
      mintAcc: tokenOut.postMint,
      decimals: tokenOut.postDecimals,
      reserves: outputVaultToken.preAmount,
    },
    slippagePct,
  };
}

// FIXME: The code below is duplicated in orca-swap-handler.ts
// Consider refactoring to avoid duplication

function getPoolPrice(
  swapEvent: raydiumClmm.events.SwapEvent,
  tokenIn: TokenBalance,
  tokenOut: TokenBalance,
): number {
  const sqrtPrice = swapEvent.sqrtPriceX64;
  const tokenADecimals = swapEvent.zeroForOne ? tokenIn.postDecimals : tokenOut.postDecimals;
  const tokenBDecimals = swapEvent.zeroForOne ? tokenOut.postDecimals : tokenIn.postDecimals;

  // Token decimals can be zero
  if (tokenADecimals === undefined || tokenBDecimals === undefined) {
    throw new Error('No token decimals found');
  }

  const poolPrice = sqrtPriceX64ToPrice(sqrtPrice, tokenADecimals, tokenBDecimals);

  return poolPrice;
}

function getSwapEvent(ins: Instruction, block: Block): SwapEvent | null {
  const logs = getInstructionLogs(ins, block);
  if (logs.length > 1) {
    const hex = Buffer.from(logs[1].message, 'base64').toString('hex');
    return raydiumClmm.events.SwapEvent.decode({ msg: `0x${hex}` });
  }
  return null;
}

// Calculate slippage based on the post-swap price and the amount of input token
// FIXME: For some reason Raydium CLMM is the only AMM where we often get negative slippage, investigate why
function getSlippage(
  tokenIn: TokenBalance,
  tokenOut: TokenBalance,
  inputTokenAmount: bigint,
  outputTokenAmount: bigint,
  swapEvent: SwapEvent,
  postPoolPrice: number,
): number {
  if (tokenIn.postDecimals === undefined || tokenOut.postDecimals === undefined) {
    throw new Error('No token decimals found');
  }

  const actualAmount = Number(outputTokenAmount) / 10 ** tokenOut.postDecimals;
  const actualInputAmount = Number(inputTokenAmount) / 10 ** tokenIn.postDecimals;

  const expectedInputAmount = swapEvent.zeroForOne
    ? actualAmount / postPoolPrice
    : actualAmount * postPoolPrice;

  const slippage = ((actualInputAmount - expectedInputAmount) / expectedInputAmount) * 100;

  return slippage;
}

// TODO: should handle swapRouterBaseIn instruction
function decodeSwap(ins: Instruction) {
  const descriptor = getInstructionDescriptor(ins);

  if (descriptor === raydiumClmm.instructions.swap.d8) {
    return raydiumClmm.instructions.swap.decode(ins);
  }

  return raydiumClmm.instructions.swapV2.decode(ins);
}
