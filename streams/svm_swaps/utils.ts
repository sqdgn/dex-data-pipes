import _ from 'lodash';
import assert from 'node:assert';
import { getInstructionData } from '@subsquid/solana-stream';
import type * as PortalData from '@subsquid/solana-normalization';
import { toHex } from '@subsquid/util-internal-hex';
import { PublicKey } from '@solana/web3.js';
import { Block, DecodedTransfer, Instruction, SwappedTokenData } from './types';
import * as tokenProgram from './contracts/token-program';
import * as token2022Program from './contracts/token-2022-program';
import { Logger } from 'pino';

export function getInstructionBalances(ins: Instruction, block: Block) {
  return block.tokenBalances?.filter((t: any) => t.transactionIndex === ins.transactionIndex) || [];
}

export function getTokenBalance(tokenBalances: Block['tokenBalances'], addr: string) {
  const tokenBalance = tokenBalances.find((b) => b.account === addr);
  if (!tokenBalance) {
    throw new Error(`Could not find token balance for account: ${addr}.`);
  }
  return tokenBalance;
}

export function getPreTokenBalance(
  tokenBalances: Block['tokenBalances'],
  addr: string,
): PortalData.PreTokenBalance {
  const tokenBalance = getTokenBalance(tokenBalances, addr);
  if (tokenBalance.preAmount === undefined) {
    throw new Error(`Token balance is not a pre-balance: ${addr}.`);
  }
  return tokenBalance as PortalData.PreTokenBalance;
}

export function getPostTokenBalance(
  tokenBalances: Block['tokenBalances'],
  addr: string,
): PortalData.PostTokenBalance {
  const tokenBalance = getTokenBalance(tokenBalances, addr);
  if (tokenBalance.postAmount === undefined) {
    throw new Error(`Token balance is not a post-balance: ${addr}.`);
  }
  return tokenBalance as PortalData.PostTokenBalance;
}

export function getNextInstruction(instruction: Instruction, instructions: Instruction[]) {
  const index = instructions.findIndex(
    (i) => i.instructionAddress === instruction.instructionAddress,
  );
  return instructions[index + 1];
}

export function getTransactionHash(ins: Instruction, block: Block) {
  const tx = getTransaction(ins, block);
  return tx.signatures[0];
}

export function getTransactionAccount(ins: Instruction, block: Block) {
  const tx = getTransaction(ins, block);
  return tx.accountKeys[0];
}

export function getTransaction(ins: Instruction, block: Block) {
  const tx = block.transactions.find((t: any) => t.transactionIndex === ins.transactionIndex);
  assert(tx, 'transaction not found');

  return tx;
}

/**
 * Get the inner instructions of a parent instruction
 *
 * @param parent Parent instruction
 * @param instructions All instructions in the block
 * @param level Optional: Level of nesting to look for
 * @returns Array of inner instructions
 */
export function getInnerInstructions(
  parent: Instruction,
  instructions: Instruction[],
  level?: number,
) {
  const parentAddrLen = parent.instructionAddress.length;
  return instructions.filter((ins) => {
    return (
      // Instruction is inside the same transaciton as parent
      ins.transactionIndex === parent.transactionIndex &&
      (level !== undefined
        ? // If `level` is provided: Instruction is nested exactly `level` levels deeper than the parent
          ins.instructionAddress.length === parentAddrLen + level
        : // Otherwise it's just nested deeper than the parent
          ins.instructionAddress.length > parentAddrLen) &&
      // Instruction address begins with parent's instruction address
      _.isEqual(
        parent.instructionAddress,
        ins.instructionAddress.slice(0, parent.instructionAddress.length),
      )
    );
  });
}

/**
 * Get the inner token transfer instructions of a parent instruction at a given level
 *
 * @param parent Parent instruction
 * @param instructions All instructions in the block
 * @param level Level of nesting to look for
 * @returns Array of inner token transfer instructions
 */
export function getInnerTransfersByLevel(
  parent: Instruction,
  instructions: Instruction[],
  level: number,
) {
  return getInnerInstructions(parent, instructions, level).filter((inner) => {
    const desc = getInstructionD1(inner);
    switch (desc) {
      case tokenProgram.instructions.transfer.d1:
      case tokenProgram.instructions.transferChecked.d1:
      case token2022Program.instructions.transfer.d1:
      case token2022Program.instructions.transferChecked.d1:
        return true;
      default:
        return false;
    }
  });
}

export function getInstructionD1(instruction: Instruction) {
  return toHex(getInstructionData(instruction)).slice(0, 4);
}

/**
 * Returns decoded token transfers from direct child instructions
 * @param ins
 * @param block
 * @returns
 */
export function getDecodedInnerTransfers(ins: Instruction, block: Block): DecodedTransfer[] {
  return getInnerTransfersByLevel(ins, block.instructions, 1).map((t) => {
    const programId = t.programId;
    const d1 = getInstructionD1(t);

    if (programId === tokenProgram.programId) {
      if (d1 === tokenProgram.instructions.transferChecked.d1) {
        return tokenProgram.instructions.transferChecked.decode(t);
      }
      if (d1 === tokenProgram.instructions.transfer.d1) {
        return tokenProgram.instructions.transfer.decode(t);
      }
    }
    if (programId === token2022Program.programId) {
      if (d1 === token2022Program.instructions.transferChecked.d1) {
        return token2022Program.instructions.transferChecked.decode(t);
      }
      if (d1 === token2022Program.instructions.transfer.d1) {
        return token2022Program.instructions.transfer.decode(t);
      }
    }

    throw new Error(`Unknown token transfer instruction: ${d1}`);
  });
}

/**
 * Convert a sqrtPrice in x64, commmon in concentrated liquidity protocols, to a human readable price
 * @param sqrtPriceX64
 * @param tokenADecimals
 * @param tokenBDecimals
 * @returns
 */
export function sqrtPriceX64ToPrice(
  sqrtPriceX64: bigint,
  tokenADecimals: number,
  tokenBDecimals: number,
): number {
  const price = (Number(sqrtPriceX64) / 2 ** 64) ** 2 * 10 ** (tokenADecimals - tokenBDecimals);
  return Number(price);
}

/**
 * Sort two accounts by their public key
 * @param accountA
 * @param accountB
 * @returns
 */
export function sortAccounts(accountA: string, accountB: string): [string, string] {
  const aBytes = new PublicKey(accountA).toBytes();
  const bBytes = new PublicKey(accountB).toBytes();

  for (let i = 0; i < 32; i++) {
    if (aBytes[i] < bBytes[i]) {
      return [accountA, accountB];
    }
    if (aBytes[i] > bBytes[i]) {
      return [accountB, accountA];
    }
  }

  throw new Error('Accounts must be different');
}

/**
 * Get all the logs of an instruction
 * @param ins
 * @param block
 * @returns
 */
export function getInstructionLogs(ins: Instruction, block: Block) {
  return (
    block.logs?.filter(
      (log) =>
        log.transactionIndex === ins.transactionIndex &&
        log.instructionAddress.length === ins.instructionAddress.length &&
        log.instructionAddress.every((v, i) => v === ins.instructionAddress[i]),
    ) || []
  );
}

/**
 * Map from token symbol to token mint address on Solana
 */
export const TOKENS = {
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  USDS: 'USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA',
  SOL: 'So11111111111111111111111111111111111111112',
};

/**
 * List of known USD stablecoins
 */
export const USD_STABLECOINS = [TOKENS.USDC, TOKENS.USDT, TOKENS.USDS];

/**
 * List of tokens (mint addresses) we use as reference (quote) tokens
 * to calculate token prices
 */
export const QUOTE_TOKENS = [...USD_STABLECOINS, TOKENS.SOL];

/**
 * Get the rank of a token in the QUOTE_TOKENS array.
 * The lower the rank, the higher the priority of the token.
 *
 * @param tokenAcc The token account to check
 * @returns The rank of the token in the QUOTE_TOKENS array
 */
function getQuoteTokenRank(tokenAcc: string) {
  const idx = QUOTE_TOKENS.indexOf(tokenAcc);
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}

/**
 * Sort the provided token pair such that the 2nd token is the quote token
 * (based on priority defined by QUOTE_TOKENS array) if possible,
 * or by mint accounts otherwsie.
 *
 * @param token1 First token to sort
 * @param token2 Second token to sort
 * @returns A tuple containing the sorted token pair
 */
export function sortTokenPair<T extends { mintAcc: string }>(token1: T, token2: T): [T, T] {
  const rank1 = getQuoteTokenRank(token1.mintAcc);
  const rank2 = getQuoteTokenRank(token2.mintAcc);
  const switchTokens =
    rank1 === rank2
      ? // If quoteTokenRank of both tokens is the same,
        // just order by accounts
        token1.mintAcc.localeCompare(token2.mintAcc) > 0
      : // Otherwise switch tokens order if the 1st token
        // appears earlier in QUOTE_TOKENS array
        rank1 < rank2;
  return switchTokens ? [token2, token1] : [token1, token2];
}

/**
 * Get price of token A in terms of token B
 *
 * @param tokenA Base token
 * @param tokenB Quote token
 *
 * @returns Price in token A in terms of token B
 */
export function getPrice(tokenA: SwappedTokenData, tokenB: SwappedTokenData) {
  // FIXME: Unsafe conversion to number!
  const a = Number(tokenA.amount) / 10 ** tokenA.decimals;
  const b = Number(tokenB.amount) / 10 ** tokenB.decimals;

  return Math.abs(b / a);
}

/**
 * Get token reserves based on vault accounts and swap instruction.
 *
 * @param ins The swap instruction
 * @param block The block containing the instruction
 * @param vaultAccounts The vault accounts to check for reserves
 *
 * @returns A record mapping token mint addresses to its reserves
 */
export function getTokenReserves(
  ins: Instruction,
  block: Block,
  vaultAccounts: string[],
): Record<string, bigint> {
  const tokenBalances = getInstructionBalances(ins, block);
  const reserves: Record<string, bigint> = {};

  vaultAccounts.forEach((vault) => {
    const tokenBalance = getPreTokenBalance(tokenBalances, vault);
    reserves[tokenBalance.preMint] = BigInt(tokenBalance.preAmount);
  });

  return reserves;
}

/**
 * Convert a token amount to a decimal string representation.
 *
 * @param amount The token amount as a bigint
 * @param decimals The number of decimals for the token
 * @returns The decimal string representation of the token amount
 */
export function asDecimalString(amount: bigint, decimals: number) {
  const sign = amount >= 0 ? '' : '-';
  const amountStr = amount.toString().replace('-', '');
  const digits = amountStr.length;
  return digits <= decimals
    ? `${sign}0.${_.padStart(amountStr, decimals, '0')}`
    : `${sign}${amountStr.slice(0, -decimals)}.${amountStr.slice(-decimals)}`;
}

const timeItMap = new Map<string, number[]>();
export function timeIt<T>(
  logger: Logger,
  label: string,
  fn: () => T,
  context?: Record<string, unknown>,
): T {
  const start = performance.now();
  const logTime = () => {
    const duration = performance.now() - start;
    // Keep only the last 100 times
    const times = timeItMap.get(label)?.slice(-99) || [];
    times.push(duration);
    timeItMap.set(label, times);
    logger.debug(
      `${label} took ${duration.toFixed(2)}ms (last ${times.length}: ` +
        `min=${_.min(times)?.toFixed(2)}, ` +
        `max=${_.max(times)?.toFixed(2)}, ` +
        `avg=${_.mean(times).toFixed(2)})` +
        (context ? ` ${JSON.stringify(context)}` : ''),
    );
  };
  const r = fn();
  if (r instanceof Promise) {
    return r.then((r) => {
      logTime();
      return r;
    }) as T;
  }
  logTime();
  return r;
}
