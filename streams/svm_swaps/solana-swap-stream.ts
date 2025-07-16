import { PortalAbstractStream } from '@sqd-pipes/core';
import { getInstructionDescriptor } from '@subsquid/solana-stream';
import {
  getTransaction,
  getTransactionAccount,
  getTransactionHash,
  timeIt,
} from './utils';
import * as meteoraDamm from './contracts/meteora-damm';
import * as meteoraDlmm from './contracts/meteora-dlmm';
import * as whirlpool from './contracts/orca-whirlpool';
import * as raydiumClmm from './contracts/raydium-clmm';
import * as raydiumAmm from './contracts/raydium-cpmm';
import * as metaplex from './contracts/metaplex';
import * as token from './contracts/token-program';
import * as token2022 from './contracts/token-2022-program';
import {
  handleMeteoraDamm,
  handleMeteoraDlmm,
} from './handlers/meteora-swap-handler';
import { handleWhirlpool } from './handlers/orca-swap-handler';
import { handleRaydiumAmm } from './handlers/raydium-amm-swap-handler';
import { handleRaydiumClmm } from './handlers/raydium-clmm-swap-handler';
import {
  PartialBlock,
  PartialInstruction,
  SolanaSwap,
  SolanaSwapCore,
  SolanaTokenMetadata,
  SolanaTokenMetadataUpdate,
  SolanaTokenMintData,
  SwapType,
} from './types';
import {
  handleCreateMetadata,
  handleUpdateMetadata,
  isCreateMetadataInstruction,
  isUpdateMetadataInstruction,
} from './handlers/metaplex-handler';
import {
  handleInitializeMint,
  isInitializeMintInstruction,
} from './handlers/initialize-mint-handler';
import { TokenStorage } from './token-storage';

type Args = {
  // Path to a database where tokens metadata will be saved
  dbPath: string;
  // Optional: If true, only the tokens will be processed (swaps will be ignored)
  onlyTokens?: boolean;
  // Optional: Limit indexing to specific tokens
  tokens?: string[];
  // Optional: Limit indexing to specific AMMs
  type?: SwapType[];
};

export const swapStreamFieldsSelection = {
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

export type SwapStreamBlock = PartialBlock<typeof swapStreamFieldsSelection>;
export type SwapStreamInstruction = PartialInstruction<
  typeof swapStreamFieldsSelection
>;

export class SolanaSwapsStream extends PortalAbstractStream<SolanaSwap, Args> {
  tokenStorage: TokenStorage;

  initialize() {
    this.tokenStorage = new TokenStorage(this.options.args.dbPath);
  }

  processTokenInstructions(blocks: SwapStreamBlock[]) {
    const tokens: SolanaTokenMintData[] = [];
    const tokensMetadata: SolanaTokenMetadata[] = [];
    const tokenMetadataUpdates: SolanaTokenMetadataUpdate[] = [];

    for (const block of blocks) {
      if (!block.instructions) {
        continue;
      }
      for (const ins of block.instructions) {
        // Initialize token mint
        if (isInitializeMintInstruction(ins)) {
          const token = handleInitializeMint(block, ins);
          tokens.push(token);
          continue;
        }

        // Create token metadata
        if (isCreateMetadataInstruction(ins)) {
          const tokenMetadata = handleCreateMetadata(ins);
          tokensMetadata.push(tokenMetadata);
          continue;
        }

        // Update token metadata
        if (isUpdateMetadataInstruction(ins)) {
          const tokenMetadataUpdate = handleUpdateMetadata(ins);
          tokenMetadataUpdates.push(tokenMetadataUpdate);
          continue;
        }
      }
    }

    timeIt(
      this.logger,
      'Processing tokens batch',
      () =>
        this.tokenStorage.processBatch(
          tokens,
          tokensMetadata,
          tokenMetadataUpdates
        ),
      {
        tokens: tokens.length,
        tokensMetadata: tokensMetadata.length,
        tokenMetadataUpdates: tokenMetadataUpdates.length,
      }
    );
  }

  processSwapInstructions(blocks: SwapStreamBlock[]) {
    const { args } = this.options;
    const swaps: SolanaSwap[] = [];
    for (const block of blocks) {
      if (!block.instructions) {
        continue;
      }
      for (const ins of block.instructions) {
        let swap: SolanaSwapCore | null = null;
        const tx = getTransaction(ins, block);
        const accountKeys = tx.accountKeys || [];

        // FIXME: Defi Tuna instructions have multiple swaps and for some reason
        // we're not being able to decode innner instructions properly.
        if (accountKeys.includes('tuna4uSQZncNeeiAMKbstuxA9CUkHH6HmC64wgmnogD'))
          continue;

        switch (ins.programId) {
          case whirlpool.programId:
            if (
              whirlpool.instructions.swap.d8 === getInstructionDescriptor(ins)
            ) {
              swap = handleWhirlpool(ins, block);
              break;
            }
            break;
          case meteoraDamm.programId:
            switch (getInstructionDescriptor(ins)) {
              case meteoraDamm.instructions.swap.d8:
                swap = handleMeteoraDamm(this.logger, ins, block);
                break;
            }
            break;
          case meteoraDlmm.programId:
            switch (getInstructionDescriptor(ins)) {
              case meteoraDlmm.instructions.swap.d8:
              case meteoraDlmm.instructions.swapExactOut.d8:
                swap = handleMeteoraDlmm(ins, block);
                break;
            }
            break;
          case raydiumAmm.programId:
            switch (getInstructionDescriptor(ins)) {
              case raydiumAmm.instructions.swapBaseInput.d8:
              case raydiumAmm.instructions.swapBaseOutput.d8:
                swap = handleRaydiumAmm(ins, block);
                break;
            }
            break;
          case raydiumClmm.programId:
            switch (getInstructionDescriptor(ins)) {
              case raydiumClmm.instructions.swap.d8:
              case raydiumClmm.instructions.swapV2.d8:
                // TODO: should uncomment this line once swapRouterBaseIn instruction handler is implemented
                // case raydiumClmm.instructions.swapRouterBaseIn.d8:
                swap = handleRaydiumClmm(ins, block);
                break;
            }
            break;
        }

        if (!swap) continue;

        if (
          args?.tokens &&
          !this.isPairAllowed(swap.input.mintAcc, swap.output.mintAcc)
        ) {
          continue;
        }

        const txHash = getTransactionHash(ins, block);

        const inputToken = {
          ...swap.input,
          ...(this.tokenStorage.getToken(swap.input.mintAcc) || {}),
        };
        const outputToken = {
          ...swap.output,
          ...(this.tokenStorage.getToken(swap.output.mintAcc) || {}),
        };

        swaps.push({
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
          slippage: swap.slippage,
        });
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
    ];

    return {
      type: 'solana',
      fields: swapStreamFieldsSelection,
      instructions: [
        // Token mint initialization instructions
        {
          programId: [token.programId],
          d1: [
            token.instructions.initializeMint.d1,
            token.instructions.initializeMint2.d1,
          ],
          isCommitted: true, // where successfully committed
          innerInstructions: true, // inner instructions
          transaction: true, // transaction, that executed the given instruction
          transactionTokenBalances: true, // all token balance records of executed transaction
        },
        {
          programId: [token2022.programId],
          d1: [
            token2022.instructions.initializeMint.d1,
            token2022.instructions.initializeMint2.d1,
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
        // Swap instructions for various Solana AMMs
        ...types.map((type) => {
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
                d1: [
                  raydiumAmm.instructions.swapBaseInput.d8,
                  raydiumAmm.instructions.swapBaseOutput.d8,
                ],
                isCommitted: true,
                innerInstructions: true,
                transaction: true,
                transactionTokenBalances: true,
                logs: true,
              };
          }
        }),
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
          // Process token-related instructions first
          // to ensure we have the necessary context
          // before processing swaps
          timeIt(this.logger, 'Processing token instructions', () => {
            this.processTokenInstructions(blocks);
          });

          if (this.options.args.onlyTokens) {
            // If onlyTokens is true - just ack the batch and return
            this.ack();
            return;
          }

          // Process swaps
          const swaps = timeIt(this.logger, 'Processing swaps', () =>
            this.processSwapInstructions(blocks)
          );

          if (!swaps.length) {
            // If we have an empty array of data, we must acknowledge the batch anyway to mark it as processed
            this.ack();
            return;
          }

          controller.enqueue(swaps);
        },
      })
    );
  }
}
