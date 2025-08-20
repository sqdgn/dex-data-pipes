import * as raydiumCpmm from '../../contracts/raydium-cpmm';
import { RaydiumCpmmSwapBaseInputHandler } from './base-input-handler';
import { RaydiumCpmmSwapBaseOutputHandler } from './base-output-handler';
import { SwapStreamInstructionHandler } from '../../solana-swap-stream.types';
import { getInstructionDescriptor } from '@subsquid/solana-stream';

export const handlerRegistry = {
  [raydiumCpmm.instructions.swapBaseInput.d8]: RaydiumCpmmSwapBaseInputHandler,
  [raydiumCpmm.instructions.swapBaseOutput.d8]: RaydiumCpmmSwapBaseOutputHandler,
} as const;

export const swapHandler: SwapStreamInstructionHandler = {
  check: ({ ins }) =>
    ins.programId === raydiumCpmm.programId &&
    Object.keys(handlerRegistry).includes(getInstructionDescriptor(ins)),
  run: ({ ins, block }) => {
    const d8 = getInstructionDescriptor(ins);
    const Handler = handlerRegistry[d8];

    if (!Handler) {
      throw new Error(`Unknown swap instruction: ${d8}`);
    }

    return new Handler(ins, block).handleSwap();
  },
};
