import assert from 'node:assert';
import Decimal from 'decimal.js';
import { DATA_SYM, getInstructionDescriptor } from '@subsquid/solana-stream';
import * as raydiumLaunchlab from '../contracts/raydium-lanuchlab';
import {
  getDecodedInnerTransfers,
  getInnerInstructions,
  getInstructionBalances,
  getPreTokenBalance,
  getTransactionHash,
  validateSwapAccounts,
} from '../utils';
import {
  Block,
  Instruction,
  LaunchLabConfig,
  LaunchLabCurveType,
  SolanaSwapCore,
} from '../types';
import { TradeEvent } from '../contracts/raydium-lanuchlab/types';
import { LaunchLabConfigStorage } from '../../storage/launchlab-config-storage';

export const DEX_NAME = 'Raydium LaunchLab';

export function decodeSwapInstruction(ins: Instruction) {
  const d8 = getInstructionDescriptor(ins);
  switch (d8) {
    case raydiumLaunchlab.instructions.buyExactIn.d8:
      return raydiumLaunchlab.instructions.buyExactIn.decode(ins);
    case raydiumLaunchlab.instructions.buyExactOut.d8:
      return raydiumLaunchlab.instructions.buyExactOut.decode(ins);
    case raydiumLaunchlab.instructions.sellExactIn.d8:
      return raydiumLaunchlab.instructions.sellExactIn.decode(ins);
    case raydiumLaunchlab.instructions.sellExactOut.d8:
      return raydiumLaunchlab.instructions.sellExactOut.decode(ins);
    default:
      throw new Error(`${DEX_NAME}: Unrecognized swap instruction`);
  }
}

function getSwapEvent(ins: Instruction, block: Block): TradeEvent {
  const innerInstructions = getInnerInstructions(ins, block.instructions);
  for (const inner of innerInstructions) {
    if (getInstructionDescriptor(inner) === '0xe445a52e51cb9a1d') {
      const hex = Buffer.from(
        (inner[DATA_SYM] as Uint8Array).slice(8)
      ).toString('hex');
      return raydiumLaunchlab.events.TradeEvent.decode({ msg: `0x${hex}` });
    }
  }
  throw new Error(
    `${DEX_NAME}: TradeEvent not found. Tx hash: ${getTransactionHash(
      ins,
      block
    )}`
  );
}

function isBuyInstruction(ins: Instruction) {
  const d8 = getInstructionDescriptor(ins);
  return (
    d8 === raydiumLaunchlab.instructions.buyExactIn.d8 ||
    d8 === raydiumLaunchlab.instructions.buyExactOut.d8
  );
}

function isSellInstruction(ins: Instruction) {
  const d8 = getInstructionDescriptor(ins);
  return (
    d8 === raydiumLaunchlab.instructions.sellExactIn.d8 ||
    d8 === raydiumLaunchlab.instructions.sellExactOut.d8
  );
}

export function isSwapInstruction(ins: Instruction) {
  return isBuyInstruction(ins) || isSellInstruction(ins);
}

export function handleSwap(
  ins: Instruction,
  block: Block,
  configStorage: LaunchLabConfigStorage
): SolanaSwapCore {
  const decoded = decodeSwapInstruction(ins);
  const event = getSwapEvent(ins, block);
  const txHash = getTransactionHash(ins, block);
  const {
    globalConfig,
    poolState: poolAcc,
    baseTokenMint,
    quoteTokenMint,
    baseVault,
    quoteVault,
    userBaseToken,
    userQuoteToken,
  } = decoded.accounts;
  // First 2 transfers should be in and out, the next ones can be fees etc.
  // Example: 2ngyETx33vv9h2NSwHcupxjiadMZ9ZQgiTrVQrPYM1mCK3q4JnLLEqbFfBPaqP5hVXopM8tzk3i9k5ePw6BVn8pa
  const [transferIn, transferOut] = getDecodedInnerTransfers(ins, block).slice(
    0,
    2
  );
  const isBuy = isBuyInstruction(ins);
  const tokenInMintAcc = isBuy ? quoteTokenMint : baseTokenMint;
  const tokenOutMintAcc = isBuy ? baseTokenMint : quoteTokenMint;
  const userInAcc = isBuy ? userQuoteToken : userBaseToken;
  const userOutAcc = isBuy ? userBaseToken : userQuoteToken;
  const reserveInAcc = isBuy ? quoteVault : baseVault;
  const reserveOutAcc = isBuy ? baseVault : quoteVault;
  validateSwapAccounts(
    transferIn,
    transferOut,
    userInAcc,
    userOutAcc,
    reserveInAcc,
    reserveOutAcc,
    txHash,
    DEX_NAME
  );

  const {
    accounts: { authority, owner },
  } = transferIn;
  const swapAcccount = authority || owner;

  assert(
    swapAcccount,
    `${DEX_NAME}: Failed to find authority/owner account! Tx: ${txHash}`
  );

  const tokenBalances = getInstructionBalances(ins, block);
  const reserveIn = getPreTokenBalance(tokenBalances, reserveInAcc);
  const reserveOut = getPreTokenBalance(tokenBalances, reserveOutAcc);

  const { curveType } = configStorage.getConfig(globalConfig);
  const decimalsBase = isBuy ? reserveOut.preDecimals : reserveIn.preDecimals;
  const decimalsQuote = isBuy ? reserveIn.preDecimals : reserveOut.preDecimals;
  const poolPriceBefore = getPoolPrice(
    curveType,
    event.virtualBase,
    event.virtualQuote,
    event.realBaseBefore,
    event.realQuoteBefore,
    decimalsBase,
    decimalsQuote
  );
  const actuallyPaidPrice = getActuallyPaidPrice(
    event,
    isBuy,
    decimalsBase,
    decimalsQuote
  );

  return {
    account: swapAcccount,
    input: {
      amount: transferIn.data.amount,
      decimals: reserveIn.preDecimals,
      mintAcc: tokenInMintAcc,
      reserves: reserveIn.preAmount,
    },
    output: {
      amount: transferOut.data.amount,
      decimals: reserveOut.preDecimals,
      mintAcc: tokenOutMintAcc,
      reserves: reserveOut.preAmount,
    },
    poolAddress: poolAcc,
    slippage:
      (isBuy ? 100 : -100) *
      actuallyPaidPrice.div(poolPriceBefore).sub(1).toNumber(),
    type: 'raydium_launchlab',
  };
}

export function handleCreateGlobalConfig(ins: Instruction): LaunchLabConfig {
  const decoded = raydiumLaunchlab.instructions.createConfig.decode(ins);
  const { globalConfig } = decoded.accounts;
  const { curveType } = decoded.data;
  return {
    account: globalConfig,
    curveType,
  };
}

function getActuallyPaidPrice(
  event: TradeEvent,
  isBuy: boolean,
  decimalsBase: number,
  decimalsQuote: number
) {
  if (isBuy) {
    const amountInSubFees =
      event.amountIn - event.platformFee - event.protocolFee - event.shareFee;
    return new Decimal(amountInSubFees)
      .div(event.amountOut)
      .mul(10 ** (decimalsBase - decimalsQuote));
  } else {
    const amountOutPlusFees =
      event.amountOut + event.platformFee + event.protocolFee + event.shareFee;
    return new Decimal(amountOutPlusFees)
      .div(event.amountIn)
      .mul(10 ** (decimalsBase - decimalsQuote));
  }
}

// Based on https://github.com/raydium-io/raydium-sdk-V2/blob/master/src/raydium/launchpad/curve
function getPoolPrice(
  curveType: LaunchLabCurveType,
  virtualBase: bigint,
  virtualQuote: bigint,
  realBase: bigint,
  realQuote: bigint,
  decimalsBase: number,
  decimalsQuote: number
): Decimal {
  switch (curveType) {
    case LaunchLabCurveType.ConstantProduct:
      return new Decimal(virtualQuote + realQuote)
        .div(virtualBase - realBase)
        .mul(10 ** (decimalsBase - decimalsQuote));
    case LaunchLabCurveType.FixedPrice:
      return new Decimal(virtualQuote)
        .div(virtualBase)
        .mul(10 ** (decimalsBase - decimalsQuote));
    case LaunchLabCurveType.Linear:
      return new Decimal(virtualBase * realBase)
        .div(2n ** 64n)
        .mul(10 ** (decimalsBase - decimalsQuote));
  }
}
