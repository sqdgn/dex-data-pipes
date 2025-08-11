import { getInstructionBalances, getPreTokenBalance } from '../../utils';
import { RaydiumCpmmSwapBaseHandler } from './base-swap-handler';
import { Block, Instruction, SolanaSwapCore } from '../../types';

interface TokenAmount {
  amount: bigint;
  decimals: number;
}

export class RaydiumCpmmSwapBaseInputHandler extends RaydiumCpmmSwapBaseHandler {
  constructor(instruction: Instruction, block: Block) {
    super(instruction, block, 'swapBaseInput');
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

    const slippagePct = this.getSlippageSwapBaseInput(
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
        decimals: inputTokenAmount.decimals,
        mintAcc: inputTokenAmount.mint,
        reserves: inputReserves,
      },
      output: {
        amount: outputTokenAmount.amount,
        decimals: outputTokenAmount.decimals,
        mintAcc: outputTokenAmount.mint,
        reserves: outputReserves,
      },
      slippagePct,
    };
  }

  private getSlippageSwapBaseInput(
    inputToken: TokenAmount,
    outputToken: TokenAmount,
    inputTokenReserves: bigint,
    outputTokenReserves: bigint,
  ) {
    const expectedAmountOutBigInt = this.getAmountOut(
      inputToken.amount,
      inputTokenReserves,
      outputTokenReserves,
    );

    const amountOut = Number(outputToken.amount) / 10 ** outputToken.decimals;
    const expectedAmountOut = Number(expectedAmountOutBigInt) / 10 ** outputToken.decimals;

    const slippagePct = ((expectedAmountOut - amountOut) / expectedAmountOut) * 100;

    return slippagePct;
  }

  private getAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): number {
    const amountInWithFee =
      amountIn *
      (RaydiumCpmmSwapBaseHandler.FEE_DENOMINATOR - RaydiumCpmmSwapBaseHandler.PROTOCOL_FEE);
    const numerator = amountInWithFee * reserveOut;
    const denominator = reserveIn * RaydiumCpmmSwapBaseHandler.FEE_DENOMINATOR + amountInWithFee;
    return Number(numerator / denominator);
  }
}
