import * as raydiumCpmm from '../../contracts/raydium-cpmm';
import { RaydiumCpmmSwapBaseInputHandler } from './base-input-handler';
import { RaydiumCpmmSwapBaseOutputHandler } from './base-output-handler';
import { Block, Instruction, SolanaSwapCore } from '../../types';
import { getInstructionDescriptor } from '@subsquid/solana-stream';

export const handlerRegistry = {
  [raydiumCpmm.instructions.swapBaseInput.d8]: RaydiumCpmmSwapBaseInputHandler,
  [raydiumCpmm.instructions.swapBaseOutput.d8]: RaydiumCpmmSwapBaseOutputHandler,
} as const;

export function handleRaydiumAmm(instruction: Instruction, block: Block): SolanaSwapCore {
  const d8 = getInstructionDescriptor(instruction);
  const Handler = handlerRegistry[d8];

  if (!Handler) {
    throw new Error(`Unknown swap instruction: ${d8}`);
  }

  return new Handler(instruction, block).handleSwap();
}
