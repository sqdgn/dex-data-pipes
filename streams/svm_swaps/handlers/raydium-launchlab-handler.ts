import assert from 'node:assert';
import Decimal from 'decimal.js';
import { DATA_SYM, getInstructionDescriptor } from '@subsquid/solana-stream';
import * as raydiumLaunchLab from '../contracts/raydium-launchlab';
import {
  getDecimals,
  getDecodedInnerTransfers,
  getInnerInstructions,
  getInstructionBalances,
  getTokenBalance,
  getTransactionHash,
  validateSwapAccounts,
} from '../utils';
import { Block, Instruction, LaunchLabConfig, LaunchLabCurveType } from '../types';
import { TradeEvent } from '../contracts/raydium-launchlab/v1/types';
import { SwapStreamInstructionHandler } from '../solana-swap-stream.types';

export const DEX_NAME = 'Raydium LaunchLab';

function getVersion(ins: Instruction, block: Block): raydiumLaunchLab.Version {
  // Return first version (when in DESC order) which starts from eariler block/tx than the current one
  const versions = raydiumLaunchLab.VERSIONS;
  for (let i = versions.length - 1; i >= 0; --i) {
    const version = versions[i];
    if (
      version.fromBlock < block.header.number ||
      (version.fromBlock === block.header.number && version.fromTxIdx < ins.transactionIndex)
    ) {
      return version.name;
    }
  }
  throw new Error(`Cannot find matching Radyium Launchlab version at block ${block.header.number}`);
}

export function decodeSwapInstruction(ins: Instruction) {
  const d8 = getInstructionDescriptor(ins);
  // Those instructions are the same in v1 and v2
  switch (d8) {
    case raydiumLaunchLab.v1.instructions.buyExactIn.d8:
      return raydiumLaunchLab.v1.instructions.buyExactIn.decode(ins);
    case raydiumLaunchLab.v1.instructions.buyExactOut.d8:
      return raydiumLaunchLab.v1.instructions.buyExactOut.decode(ins);
    case raydiumLaunchLab.v1.instructions.sellExactIn.d8:
      return raydiumLaunchLab.v1.instructions.sellExactIn.decode(ins);
    case raydiumLaunchLab.v1.instructions.sellExactOut.d8:
      return raydiumLaunchLab.v1.instructions.sellExactOut.decode(ins);
    default:
      throw new Error(`${DEX_NAME}: Unrecognized swap instruction`);
  }
}

function getSwapEvent(ins: Instruction, block: Block, version?: raydiumLaunchLab.Version) {
  version = version || getVersion(ins, block);
  const innerInstructions = getInnerInstructions(ins, block.instructions);
  for (const inner of innerInstructions) {
    if (getInstructionDescriptor(inner) === '0xe445a52e51cb9a1d') {
      const hex = Buffer.from((inner[DATA_SYM] as Uint8Array).slice(8)).toString('hex');
      return raydiumLaunchLab[version].events.TradeEvent.decode({ msg: `0x${hex}` });
    }
  }
  throw new Error(`${DEX_NAME}: TradeEvent not found`);
}

function isBuyInstruction(ins: Instruction) {
  const d8 = getInstructionDescriptor(ins);
  return (
    d8 === raydiumLaunchLab.v1.instructions.buyExactIn.d8 ||
    d8 === raydiumLaunchLab.v1.instructions.buyExactOut.d8
  );
}

function isSellInstruction(ins: Instruction) {
  const d8 = getInstructionDescriptor(ins);
  return (
    d8 === raydiumLaunchLab.v1.instructions.sellExactIn.d8 ||
    d8 === raydiumLaunchLab.v1.instructions.sellExactOut.d8
  );
}

export const swapHandler: SwapStreamInstructionHandler = {
  check: ({ ins }) =>
    ins.programId === raydiumLaunchLab.programId &&
    (isBuyInstruction(ins) || isSellInstruction(ins)),
  run: ({ ins, block, context: { storage } }) => {
    const version = getVersion(ins, block);
    const decoded = decodeSwapInstruction(ins);
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
    const [transferIn, transferOut] = getDecodedInnerTransfers(ins, block).slice(0, 2);
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
      DEX_NAME,
    );

    const {
      accounts: { authority, owner },
    } = transferIn;
    const swapAcccount = authority || owner;

    assert(swapAcccount, `${DEX_NAME}: Failed to find authority/owner account! Tx: ${txHash}`);

    const tokenBalances = getInstructionBalances(ins, block);
    const reserveIn = getTokenBalance(tokenBalances, reserveInAcc);
    const reserveOut = getTokenBalance(tokenBalances, reserveOutAcc);

    const { curveType } = storage.launchLabConfig.getConfig(globalConfig);
    const decimalsBase = isBuy ? getDecimals(reserveOut) : getDecimals(reserveIn);
    const decimalsQuote = isBuy ? getDecimals(reserveIn) : getDecimals(reserveOut);

    const event = getSwapEvent(ins, block, version);
    const poolPriceBefore = getPoolPrice(
      curveType,
      event.virtualBase,
      event.virtualQuote,
      event.realBaseBefore,
      event.realQuoteBefore,
      decimalsBase,
      decimalsQuote,
    );
    const actuallyPaidPrice = getActuallyPaidPrice(event, isBuy, decimalsBase, decimalsQuote);

    return {
      account: swapAcccount,
      input: {
        amount: transferIn.data.amount,
        decimals: getDecimals(reserveIn),
        mintAcc: tokenInMintAcc,
        reserves: reserveIn.preAmount || 0n,
      },
      output: {
        amount: transferOut.data.amount,
        decimals: getDecimals(reserveOut),
        mintAcc: tokenOutMintAcc,
        reserves: reserveOut.preAmount || 0n,
      },
      poolAddress: poolAcc,
      slippagePct: (isBuy ? 100 : -100) * actuallyPaidPrice.div(poolPriceBefore).sub(1).toNumber(),
      type: 'raydium_launchlab',
    };
  },
};

export const createGlobalConfigHandler: SwapStreamInstructionHandler = {
  check: ({ ins }) =>
    ins.programId === raydiumLaunchLab.programId &&
    getInstructionDescriptor(ins) === raydiumLaunchLab.v1.instructions.createConfig.d8,
  run: ({ ins, context: { storage } }) => {
    // No diff between v1 and v2
    const decoded = raydiumLaunchLab.v1.instructions.createConfig.decode(ins);
    const { globalConfig } = decoded.accounts;
    const { curveType } = decoded.data;
    const config: LaunchLabConfig = {
      account: globalConfig,
      curveType,
    };
    storage.launchLabConfig.insertConfig(config);
  },
};

function getActuallyPaidPrice(
  event: TradeEvent,
  isBuy: boolean,
  decimalsBase: number,
  decimalsQuote: number,
) {
  if (isBuy) {
    const amountInSubFees = event.amountIn - event.platformFee - event.protocolFee - event.shareFee;
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
  decimalsQuote: number,
): Decimal {
  switch (curveType) {
    case LaunchLabCurveType.ConstantProduct:
      return new Decimal(virtualQuote + realQuote)
        .div(virtualBase - realBase)
        .mul(10 ** (decimalsBase - decimalsQuote));
    case LaunchLabCurveType.FixedPrice:
      return new Decimal(virtualQuote).div(virtualBase).mul(10 ** (decimalsBase - decimalsQuote));
    case LaunchLabCurveType.Linear:
      return new Decimal(virtualBase * realBase)
        .div(2n ** 64n)
        .mul(10 ** (decimalsBase - decimalsQuote));
  }
}
