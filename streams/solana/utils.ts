import _ from 'lodash';
import assert from 'node:assert';
import { getInstructionData } from '@subsquid/solana-stream';
import type * as PortalData from '@subsquid/solana-normalization';
import { toHex } from '@subsquid/util-internal-hex';
import { PublicKey } from '@solana/web3.js';
import {
  BasicTokenInfo,
  Block,
  DecodedTransfer,
  Instruction,
  InstructionContext,
  ProgramVersion,
  SwappedTokenData,
} from './types';
import * as tokenProgram from './contracts/token-program';
import * as token2022Program from './contracts/token-2022-program';
import { Logger } from 'pino';
import { DecodedInstruction } from './contracts/abi.support';

export function getInstructionBalances(ins: Instruction, block: Block) {
  return block.tokenBalances?.filter((t) => t.transactionIndex === ins.transactionIndex) || [];
}

export function normalizeTokenBalance(tokenBalance: Block['tokenBalances'][number]) {
  // Normalize amounts
  if (typeof tokenBalance.preAmount === 'string') {
    tokenBalance.preAmount = BigInt(tokenBalance.preAmount);
  }
  if (typeof tokenBalance.postAmount === 'string') {
    tokenBalance.postAmount = BigInt(tokenBalance.postAmount);
  }
  // Normalize nulls
  for (const k in tokenBalance) {
    if (tokenBalance[k] === null) {
      tokenBalance[k] = undefined;
    }
  }
  return tokenBalance;
}

function isPreBalance(
  balance: Block['tokenBalances'][number],
): balance is PortalData.PreTokenBalance {
  return !!balance.preMint;
}

function isPostBalance(
  balance: Block['tokenBalances'][number],
): balance is PortalData.PostTokenBalance {
  return !!balance.postMint;
}

export function getTokenBalance(tokenBalances: Block['tokenBalances'], addr: string) {
  const tokenBalance = tokenBalances.find((b) => b.account === addr);
  if (!tokenBalance) {
    throw new Error(`Could not find token balance for account: ${addr}.`);
  }
  return normalizeTokenBalance(tokenBalance);
}

export function getPreTokenBalance(
  tokenBalances: Block['tokenBalances'],
  addr: string,
): PortalData.PreTokenBalance {
  const tokenBalance = getTokenBalance(tokenBalances, addr);
  if (!isPreBalance(tokenBalance)) {
    throw new Error(`Token balance is not a pre-balance: ${addr}.`);
  }
  return tokenBalance;
}

export function getPostTokenBalance(
  tokenBalances: Block['tokenBalances'],
  addr: string,
): PortalData.PostTokenBalance {
  const tokenBalance = getTokenBalance(tokenBalances, addr);
  if (!isPostBalance(tokenBalance)) {
    throw new Error(`Token balance is not a post-balance: ${addr}.`);
  }
  return tokenBalance;
}

export function getPrePostTokenBalance(
  tokenBalances: Block['tokenBalances'],
  addr: string,
): PortalData.PrePostTokenBalance {
  const tokenBalance = getTokenBalance(tokenBalances, addr);
  if (!isPreBalance(tokenBalance) || !isPostBalance(tokenBalance)) {
    throw new Error(`Token balance is not a pre-post-balance: ${addr}.`);
  }
  return tokenBalance;
}

export function getDecimals(tokenBalance: Block['tokenBalances'][number]): number {
  const decimals = tokenBalance.preDecimals ?? tokenBalance.postDecimals;
  if (decimals === undefined || decimals === null) {
    throw new Error(`Cannot retrieve decimals from token balance`);
  }
  return decimals;
}

export function getTokenInfoFromTransfer(
  txTokenBalances: Block['tokenBalances'],
  transfer: DecodedTransfer,
): BasicTokenInfo {
  const tokenBalances = txTokenBalances.filter(
    (b) => b.account === transfer.accounts.source || b.account === transfer.accounts.destination,
  );
  // Find token information and make sure it's consistent
  // in all related tokenBalances
  let tokenInfo: BasicTokenInfo | null = null;
  for (const balance of tokenBalances) {
    const mint = isPostBalance(balance) ? balance.postMint : balance.preMint;
    const decimals = isPostBalance(balance) ? balance.postDecimals : balance.preDecimals;
    assert(mint);
    assert(decimals);
    const foundTokenInfo = { mint, decimals };
    if (tokenInfo !== null && !_.isEqual(foundTokenInfo, tokenInfo)) {
      throw new Error(
        `Cannot find consistent token information from transfer: ${JSON.stringify({
          transfer,
          tokenInfo,
          foundTokenInfo,
        })}`,
      );
    }
    tokenInfo = foundTokenInfo;
  }

  if (!tokenInfo) {
    throw new Error(`Cannot find token information from transfer: ${JSON.stringify(transfer)}`);
  }

  return tokenInfo;
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
  const tx = block.transactions.find((t) => t.transactionIndex === ins.transactionIndex);
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
  level?: number,
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

export function getInstructionD4(instruction: Instruction) {
  return toHex(getInstructionData(instruction)).slice(0, 16);
}

/**
 * Returns decoded token transfers from direct child instructions
 * @param ins
 * @param block
 * @returns
 */
export function getDecodedInnerTransfers(
  ins: Instruction,
  block: Block,
  level: number | null = 1,
): DecodedTransfer[] {
  return getInnerTransfersByLevel(ins, block.instructions, level || undefined).map((t) => {
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
  if (decimals === 0) {
    return amount.toString();
  }
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
  logEvery = 1,
  statOver = 100,
): T {
  const start = performance.now();
  const logTime = () => {
    const duration = performance.now() - start;
    let times = timeItMap.get(label) || [];
    times.push(duration);
    // Log only every 10000 times
    if (times.length % logEvery === 0) {
      times = times.slice(-statOver);
      logger.debug(
        `${label} took ${duration.toFixed(2)}ms (last ${times.length}: ` +
          `min=${_.min(times)?.toFixed(2)}, ` +
          `max=${_.max(times)?.toFixed(2)}, ` +
          `avg=${_.mean(times).toFixed(2)})` +
          (context ? ` ${JSON.stringify(context)}` : ''),
      );
    }
    timeItMap.set(label, times);
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

/**
 * Validate if src/dest accounts of given transfers match the expected ones.
 *
 * @param transferIn   Transfer from user to liquidity pool
 * @param transferOut  Transfer from liquidity pool to user
 * @param userIn       User account for input token (transferred to pool)
 * @param userOut      User account for output token (transferred from pool)
 * @param reserveIn    Account holding input token reserves
 * @param reserveOut   Account holding output token reserves
 * @param txHash       Hash of the transaction (for debugging purposes)
 * @param dexName      Dex name (for debugging purposes)
 */
export function validateSwapAccounts(
  transferIn: DecodedInstruction<{ source: string; destination: string }, unknown>,
  transferOut: DecodedInstruction<{ source: string; destination: string }, unknown>,
  userIn: string,
  userOut: string,
  reserveIn: string,
  reserveOut: string,
  txHash: string,
  dexName: string,
) {
  assert(
    transferIn.accounts.source === userIn,
    `${dexName}: Input transfer source account does not match user's input token account. Tx: ${txHash}`,
  );
  assert(
    transferOut.accounts.destination === userOut,
    `${dexName}: Output transfer destination account does not match user's output token account. Tx: ${txHash}`,
  );
  assert(
    transferIn.accounts.destination === reserveIn,
    `${dexName}: Input transfer destination account does not match input token reserve account. Tx: ${txHash}`,
  );
  assert(
    transferOut.accounts.source === reserveOut,
    `${dexName}: Output transfer source account does not match output token reserve account. Tx: ${txHash}`,
  );
}

export function getInstructionContext(ins: Instruction, block: Block): InstructionContext {
  return {
    block: {
      number: block.header.number,
      hash: block.header.hash,
      timestamp: block.header.timestamp,
    },
    instruction: {
      address: ins.instructionAddress,
    },
    transaction: {
      hash: getTransactionHash(ins, block),
      index: ins.transactionIndex,
    },
    timestamp: new Date(block.header.timestamp * 1000),
  };
}

export function createGetProgramVersionFunc<T extends string>(
  versions: ProgramVersion<T>[],
  name: string,
) {
  return function (ins: Instruction, block: Block) {
    // Return first version (when in DESC order) which starts from eariler block/tx than the current one
    for (let i = versions.length - 1; i >= 0; --i) {
      const version = versions[i];
      if (
        version.fromBlock < block.header.number ||
        (version.fromBlock === block.header.number && version.fromTxIdx < ins.transactionIndex)
      ) {
        return version.name;
      }
    }
    throw new Error(`Cannot find matching ${name} version at block ${block.header.number}`);
  };
}
