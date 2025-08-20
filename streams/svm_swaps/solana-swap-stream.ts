import { PortalAbstractStream } from '@sqd-pipes/core';
import { getTransaction, getTransactionAccount, getTransactionHash, timeIt } from './utils';
import * as meteoraDamm from './contracts/meteora-damm';
import * as meteoraDlmm from './contracts/meteora-dlmm';
import * as whirlpool from './contracts/orca-whirlpool';
import * as raydiumClmm from './contracts/raydium-clmm';
import * as raydiumAmm from './contracts/raydium-cpmm';
import * as raydiumLaunchLab from './contracts/raydium-launchlab';
import * as metaplex from './contracts/metaplex';
import * as token from './contracts/token-program';
import * as token2022 from './contracts/token-2022-program';
import * as BPFLoaderUpgradeable from './contracts/bpf-loader-upgradeable';
import * as handlers from './handlers';
import { SolanaSwap, SolanaSwapCore, SwapType } from './types';
import { MetadataStorage } from '../storage/metadata-storage';
import {
  SwapStreamBlock,
  swapStreamFieldsSelection,
  SwapStreamInstruction,
} from './solana-swap-stream.types';

type Args = {
  // Path to a database where tokens metadata will be saved
  dbPath: string;
  // Optional: If true, only the metadata (tokens, pool configs etc.) will be processed
  // and swaps will be ignored.
  onlyMeta?: boolean;
  // Optional: Limit indexing to specific tokens
  tokens?: string[];
  // Optional: Limit indexing to specific AMMs
  type?: SwapType[];
};

export class SolanaSwapsStream extends PortalAbstractStream<SolanaSwap, Args> {
  storage: MetadataStorage;

  initialize() {
    this.storage = new MetadataStorage(this.options.args.dbPath);
  }

  handleInstruction(ins: SwapStreamInstruction, block: SwapStreamBlock): SolanaSwapCore | null {
    const context = {
      logger: this.logger,
      storage: this.storage,
      onlyMeta: this.options.args.onlyMeta || false,
    };
    const swapHandlers = [
      handlers.raydiumAmm.swapHandler,
      handlers.raydiumClmm.clmmSwapHandler,
      handlers.meteora.dammSwapHandler,
      handlers.meteora.dlmmSwapHandler,
      handlers.orca.whirlpoolSwapHandler,
      handlers.raydiumLaunchLab.swapHandler,
    ];
    const metadataHandlers = [
      handlers.BPFLoaderUpgradeable.upgradeHandler,
      handlers.token.initializeMintHandler,
      handlers.token.mintHandler,
      handlers.token.burnHandler,
      handlers.metaplex.createMetadataHandler,
      handlers.metaplex.updateMetadataHandler,
      handlers.raydiumLaunchLab.createGlobalConfigHandler,
    ];

    // Metadata handlers
    for (const handler of metadataHandlers) {
      if (handler.check({ ins, block })) {
        handler.run({ ins, block, context });
        return null;
      }
    }

    if (!context.onlyMeta) {
      // Swap handlers
      for (const handler of swapHandlers) {
        if (handler.check({ ins, block })) {
          const tx = getTransaction(ins, block);
          const accountKeys = tx.accountKeys || [];
          // FIXME: Defi Tuna instructions have multiple swaps and for some reason
          // we're not being able to decode innner instructions properly.
          if (accountKeys.includes('tuna4uSQZncNeeiAMKbstuxA9CUkHH6HmC64wgmnogD')) {
            return null;
          }
          const swap = handler.run({ ins, block, context });
          return swap || null;
        }
      }
    }

    return null;
  }

  processSwap(
    swap: SolanaSwapCore,
    block: SwapStreamBlock,
    ins: SwapStreamInstruction,
  ): SolanaSwap | null {
    if (this.options.args?.tokens && !this.isPairAllowed(swap.input.mintAcc, swap.output.mintAcc)) {
      return null;
    }

    const txHash = getTransactionHash(ins, block);

    const inputToken = {
      ...swap.input,
      ...(this.storage.tokens.getToken(swap.input.mintAcc) || {}),
    };
    const outputToken = {
      ...swap.output,
      ...(this.storage.tokens.getToken(swap.output.mintAcc) || {}),
    };

    return {
      id: `${txHash}/${ins.transactionIndex}`,
      type: swap.type,
      block: {
        number: block.header.number,
        hash: block.header.hash,
        timestamp: block.header.timestamp,
      },
      instruction: {
        address: ins.instructionAddress,
      },
      input: inputToken,
      output: outputToken,
      account: getTransactionAccount(ins, block),
      transaction: {
        hash: txHash,
        index: ins.transactionIndex,
      },
      timestamp: new Date(block.header.timestamp * 1000),
      poolAddress: swap.poolAddress,
      slippagePct: swap.slippagePct,
    };
  }

  processInstructions(blocks: SwapStreamBlock[]) {
    const swaps: SolanaSwap[] = [];
    for (const block of blocks) {
      if (!block.instructions) {
        continue;
      }
      for (const ins of block.instructions) {
        try {
          const swapCore = this.handleInstruction(ins, block);
          if (swapCore) {
            const swap = this.processSwap(swapCore, block, ins);
            if (swap) {
              swaps.push(swap);
            }
          }
        } catch (e) {
          const txHash = getTransactionHash(ins, block);
          this.logger.error(`Failed to process instruction! Tx hash: ${txHash}`);
          throw e;
        }
      }
    }

    return swaps;
  }

  getPortalQuery() {
    const { args } = this.options;

    const types = args?.type || [
      'orca_whirlpool',
      'meteora_damm',
      'meteora_dlmm',
      'raydium_clmm',
      'raydium_amm',
      'raydium_launchlab',
    ];

    return {
      type: 'solana',
      fields: swapStreamFieldsSelection,
      instructions: [
        {
          programId: [BPFLoaderUpgradeable.programId],
          d4: [BPFLoaderUpgradeable.instructions.upgrade.d4],
          isCommitted: true,
          transaction: true,
        },
        {
          programId: [token.programId],
          d1: [
            // Mint initialization instructions
            token.instructions.initializeMint.d1,
            token.instructions.initializeMint2.d1,
            // Instructions affecting token market cap
            token.instructions.mintTo.d1,
            token.instructions.mintToChecked.d1,
            token.instructions.burn.d1,
            token.instructions.burnChecked.d1,
          ],
          isCommitted: true, // where successfully committed
          innerInstructions: true, // inner instructions
          transaction: true, // transaction, that executed the given instruction
          transactionTokenBalances: true, // all token balance records of executed transaction
        },
        {
          programId: [token2022.programId],
          d1: [
            // Mint initialization instructions
            token2022.instructions.initializeMint.d1,
            token2022.instructions.initializeMint2.d1,
            // Instructions affecting token market cap
            token2022.instructions.mintTo.d1,
            token2022.instructions.mintToChecked.d1,
            token2022.instructions.burn.d1,
            token2022.instructions.burnChecked.d1,
          ],
          isCommitted: true, // where successfully committed
          innerInstructions: true, // inner instructions
          transaction: true, // transaction, that executed the given instruction
          transactionTokenBalances: true, // all token balance records of executed transaction
        },
        // Metaplex instructions to track tokens metadata
        {
          programId: [metaplex.programId],
          d1: [
            metaplex.instructions.createMetadataAccount.d1,
            metaplex.instructions.createMetadataAccountV2.d1,
            metaplex.instructions.createMetadataAccountV3.d1,
            metaplex.instructions.updateMetadataAccount.d1,
            metaplex.instructions.updateMetadataAccountV2.d1,
          ],
          isCommitted: true, // where successfully committed
          innerInstructions: true, // inner instructions
          transaction: true, // transaction, that executed the given instruction
          transactionTokenBalances: true, // all token balance records of executed transaction
        },
        ...(types.includes('raydium_launchlab')
          ? [
              // Raydium LaunchLab create config instructions
              {
                programId: [raydiumLaunchLab.programId],
                // createConfig in v1 and v2 are the same
                d8: [raydiumLaunchLab.v1.instructions.createConfig.d8],
                isCommitted: true,
                innerInstructions: true,
                transaction: true,
                transactionTokenBalances: true,
              },
            ]
          : []),
        // Swap instructions for various Solana AMMs
        ...(args.onlyMeta
          ? []
          : types.map((type) => {
              switch (type) {
                case 'orca_whirlpool':
                  return {
                    programId: [whirlpool.programId],
                    d8: [whirlpool.instructions.swap.d8],
                    isCommitted: true,
                    innerInstructions: true,
                    transaction: true,
                    transactionTokenBalances: true,
                    logs: true,
                  };
                case 'meteora_damm':
                  return {
                    programId: [meteoraDamm.programId],
                    d8: [meteoraDamm.instructions.swap.d8],
                    isCommitted: true,
                    innerInstructions: true,
                    transaction: true,
                    transactionTokenBalances: true,
                    logs: true,
                  };
                case 'meteora_dlmm':
                  return {
                    programId: [meteoraDlmm.programId],
                    d8: [
                      meteoraDlmm.instructions.swap.d8,
                      meteoraDlmm.instructions.swapExactOut.d8,
                    ],
                    isCommitted: true,
                    innerInstructions: true,
                    transaction: true,
                    transactionTokenBalances: true,
                    logs: true,
                  };
                case 'raydium_clmm':
                  return {
                    programId: [raydiumClmm.programId],
                    d8: [
                      raydiumClmm.instructions.swap.d8,
                      raydiumClmm.instructions.swapV2.d8,
                      raydiumClmm.instructions.swapRouterBaseIn.d8,
                    ],
                    isCommitted: true,
                    innerInstructions: true,
                    transaction: true,
                    transactionTokenBalances: true,
                    logs: true,
                  };
                case 'raydium_amm':
                  return {
                    programId: [raydiumAmm.programId],
                    d8: [
                      raydiumAmm.instructions.swapBaseInput.d8,
                      raydiumAmm.instructions.swapBaseOutput.d8,
                    ],
                    isCommitted: true,
                    innerInstructions: true,
                    transaction: true,
                    transactionTokenBalances: true,
                    logs: true,
                  };
                case 'raydium_launchlab':
                  return {
                    programId: [raydiumLaunchLab.programId],
                    d8: [
                      // Those instructions are the same in v1 and v2
                      raydiumLaunchLab.v1.instructions.buyExactIn.d8,
                      raydiumLaunchLab.v1.instructions.buyExactOut.d8,
                      raydiumLaunchLab.v1.instructions.sellExactIn.d8,
                      raydiumLaunchLab.v1.instructions.sellExactOut.d8,
                    ],
                    isCommitted: true,
                    innerInstructions: true,
                    transaction: true,
                    transactionTokenBalances: true,
                    logs: true,
                  };
              }
            })),
      ],
    };
  }

  private isPairAllowed(inputTokenMint: string, outputTokenMint: string) {
    const { tokens } = this.options.args || {};

    if (!tokens) return true;

    const isInAllowed = tokens.includes(inputTokenMint);
    const isOutAllowed = tokens.includes(outputTokenMint);

    return isInAllowed && isOutAllowed;
  }

  async stream(): Promise<ReadableStream<SolanaSwap[]>> {
    const query = this.getPortalQuery();
    const source = await this.getStream<SwapStreamBlock, typeof query>(query);

    return source.pipeThrough(
      new TransformStream({
        transform: ({ blocks }, controller) => {
          const [lastBlock] = blocks.slice(-1);

          this.storage.beginTransaction();

          const swaps = timeIt(this.logger, 'Processing swap stream instructions', () =>
            this.processInstructions(blocks),
          );

          timeIt(this.logger, 'Committing SQLite changes', () => {
            this.storage.tokens.persistChanges();
            this.storage.commit(lastBlock.header.number);
          });

          if (!swaps.length) {
            // If we have an empty array of data, we must acknowledge the batch anyway to mark it as processed
            this.ack();
            return;
          }

          controller.enqueue(swaps);
        },
      }),
    );
  }
}
