import { getInstructionBalances, getPreTokenBalance } from '../../../utils';
import { RaydiumCpmmSwapBaseHandler } from './base-swap-handler';
import { Block, Instruction, SolanaSwapCore } from '../../../types';

export class RaydiumCpmmSwapBaseOutputHandler extends RaydiumCpmmSwapBaseHandler {
  constructor(instruction: Instruction, block: Block) {
    super(instruction, block, 'swapBaseOutput');
  }

  handleSwap(): SolanaSwapCore {
    const { inputVault, outputVault, poolAddress } = this.getAccounts();

    const tokenBalances = getInstructionBalances(this.instruction, this.block);
    const { preAmount: inputReserves } = getPreTokenBalance(tokenBalances, inputVault);
    const { preAmount: outputReserves } = getPreTokenBalance(tokenBalances, outputVault);

    const { inputTokenAmount, outputTokenAmount, authority, owner } =
      this.getInputAndOutputTokenAmounts();

    const account = authority || owner;
    if (!account) {
      throw new Error('Expected either authority or owner account');
    }

    const slippagePct = this.getSlippageSwapBaseOutput(
      inputTokenAmount,
      outputTokenAmount,
      inputReserves,
      outputReserves,
    );

    return {
      type: 'raydium_amm',
      poolAddress,
      account,
      input: {
        amount: inputTokenAmount.amount,
        mintAcc: inputTokenAmount.mint,
        decimals: inputTokenAmount.decimals,
        reserves: inputReserves,
      },
      output: {
        amount: outputTokenAmount.amount,
        mintAcc: outputTokenAmount.mint,
        decimals: outputTokenAmount.decimals,
        reserves: outputReserves,
      },
      slippagePct,
    };
  }

  private getSlippageSwapBaseOutput(
    inputToken: { amount: bigint; decimals: number },
    outputToken: { amount: bigint; decimals: number },
    inputTokenReserves: bigint,
    outputTokenReserves: bigint,
  ) {
    const expectedAmountInBigInt = this.getAmountIn(
      outputToken.amount,
      inputTokenReserves,
      outputTokenReserves,
    );

    const amountIn = Number(inputToken.amount) / 10 ** inputToken.decimals;
    const expectedAmountIn = Number(expectedAmountInBigInt) / 10 ** inputToken.decimals;

    const slippage = ((amountIn - expectedAmountIn) / expectedAmountIn) * 100;

    return slippage;
  }

  private getAmountIn(amountOut: bigint, reserveIn: bigint, reserveOut: bigint): number {
    const numerator = reserveIn * amountOut * RaydiumCpmmSwapBaseHandler.FEE_DENOMINATOR;
    const denominator =
      (reserveOut - amountOut) *
      (RaydiumCpmmSwapBaseHandler.FEE_DENOMINATOR - RaydiumCpmmSwapBaseHandler.PROTOCOL_FEE);
    return Number(numerator / denominator);
  }
}
