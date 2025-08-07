import _ from 'lodash';
import { PortalAbstractStream, StreamOptions } from '@sqd-pipes/core';
import { ClickHouseClient } from '@clickhouse/client';
import * as token from './contracts/token-program';
import * as token2022 from './contracts/token-2022-program';
import { PartialBlock, PartialInstruction, TokenHoldersEntry } from './types';
import {
  decodeInitializeMint,
  isInitializeMintInstruction,
} from './handlers/initialize-mint-handler';
import { HolderCounter } from './util/HolderCounter';
import { getInstructionContext, getTransactionHash, normalizeTokenBalance } from './utils';

export const holdersStreamFieldsSelection = {
  block: {
    number: true,
    hash: true,
    timestamp: true,
  },
  transaction: {
    transactionIndex: true,
    signatures: true,
    accountKeys: true,
    loadedAddresses: true,
  },
  instruction: {
    transactionIndex: true,
    data: true,
    instructionAddress: true,
    programId: true,
    accounts: true,
  },
  tokenBalance: {
    transactionIndex: true,
    account: true,
    preMint: true,
    postMint: true,
    preAmount: true,
    postAmount: true,
    preDecimals: true,
    postDecimals: true,
  },
  log: {
    transactionIndex: true,
    instructionAddress: true,
    message: true,
    logIndex: true,
  },
};

export type HoldersStreamBlock = PartialBlock<typeof holdersStreamFieldsSelection>;
export type HoldersStreamInstruction = PartialInstruction<typeof holdersStreamFieldsSelection>;

type Args = {
  clickhouse: ClickHouseClient;
  debugTokens?: string[];
};

export class SolanaHoldersStream extends PortalAbstractStream<TokenHoldersEntry, Args> {
  private holderCounter: HolderCounter;

  constructor(options: StreamOptions<Args>) {
    super(options);
    this.holderCounter = new HolderCounter(options.args.clickhouse);
  }

  getPortalQuery() {
    return {
      type: 'solana',
      fields: holdersStreamFieldsSelection,
      instructions: [
        // We need to track all instructions which can affect token balances
        // as well as initializeMint instructions to know if a given token was
        // created before or after the start (BLOCK_FROM) of our data
        {
          programId: [token.programId],
          d1: [
            token.instructions.initializeMint.d1,
            token.instructions.initializeMint2.d1,
            token.instructions.mintTo.d1,
            token.instructions.mintToChecked.d1,
            token.instructions.transfer.d1,
            token.instructions.transferChecked.d1,
            token.instructions.burn.d1,
            token.instructions.burnChecked.d1,
          ],
          isCommitted: true, // where successfully committed
          transaction: true, // transaction, that executed the given instruction
          transactionTokenBalances: true, // all token balance records of executed transaction
        },
        {
          programId: [token2022.programId],
          d1: [
            token2022.instructions.initializeMint.d1,
            token2022.instructions.initializeMint2.d1,
            token2022.instructions.mintTo.d1,
            token2022.instructions.mintToChecked.d1,
            token2022.instructions.transfer.d1,
            token2022.instructions.transferChecked.d1,
            token2022.instructions.transferFeeExtension.d1, // To support transfers w/ fees
            token2022.instructions.transferHookExtension.d1, // To support transfers w/ hooks
            token2022.instructions.burn.d1,
            token2022.instructions.burnChecked.d1,
          ],
          isCommitted: true, // where successfully committed
          transaction: true, // transaction, that executed the given instruction
          transactionTokenBalances: true, // all token balance records of executed transaction
        },
      ],
    };
  }

  private debugTokenBalances(
    block: HoldersStreamBlock,
    tokenBalances: HoldersStreamBlock['tokenBalances'],
  ) {
    const { debugTokens } = this.options.args;
    if (!debugTokens) {
      return;
    }
    for (const token of debugTokens) {
      const debugBalances = tokenBalances
        .filter((b) => b.postMint === token)
        .map((b) => {
          return {
            ...b,
            tx: block.transactions.find((t) => t.transactionIndex === b.transactionIndex)
              ?.signatures[0],
          };
        });
      if (debugBalances.length) {
        this.logger.debug(debugBalances, `Balances of ${token} at block ${block.header.number}`);
      }
    }
  }

  async stream(): Promise<ReadableStream<TokenHoldersEntry[]>> {
    const query = this.getPortalQuery();
    const source = await this.getStream<HoldersStreamBlock, typeof query>(query);

    return source.pipeThrough(
      new TransformStream({
        start: async () => {
          await this.holderCounter.loadFromDb();
        },
        transform: ({ blocks }, controller) => {
          for (const block of blocks) {
            for (const ins of block.instructions || []) {
              try {
                if (isInitializeMintInstruction(ins)) {
                  const decoded = decodeInitializeMint(ins);
                  const tokenAccount = decoded.accounts.mint;
                  this.holderCounter.startTracking(tokenAccount);
                }
              } catch (e) {
                const txHash = getTransactionHash(ins, block);
                this.logger.error(e, `Error processing instruction in tx ${txHash}.`);
                throw e;
              }
            }
            const tokenBalances = (block.tokenBalances || []).map((b) => normalizeTokenBalance(b));
            this.debugTokenBalances(block, tokenBalances);
            const holderIncrements = _.chain(tokenBalances)
              .filter((b) => Boolean(!b.preAmount && b.postAmount))
              .countBy((b) => b.postMint)
              .entries()
              .valueOf();
            const holderDecrements = _.chain(tokenBalances)
              .filter((b) => Boolean(b.preAmount && !b.postAmount))
              .countBy((b) => b.postMint)
              .entries()
              .valueOf();
            // Process increments first to avoid setting a negative number of holders
            for (const [token, inc] of holderIncrements) {
              this.holderCounter.incHolders(token, inc);
            }
            for (const [token, dec] of holderDecrements) {
              this.holderCounter.decHolders(token, dec);
            }
          }

          const updates = this.holderCounter.getUpdatesBatch();
          const [lastBlock] = blocks.slice(-1);

          if (!updates.length) {
            // If we have an empty array of data, we must acknowledge the batch anyway to mark it as processed
            this.ack();
            return;
          }

          controller.enqueue(
            updates.map((u) => ({
              ...u,
              timestamp: lastBlock.header.timestamp,
            })),
          );
        },
      }),
    );
  }
}
