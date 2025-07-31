import assert from 'node:assert';
import * as raydiumCpmm from '../../contracts/raydium-cpmm';
import { getDecodedInnerTransfers, getInstructionBalances, getPostTokenBalance } from '../../utils';
import { TokenAmount, Instruction, Block, SolanaSwapCore } from '../../types';

interface Token {
  mint: string;
  decimals: number;
}

/**
 * Base class for Raydium CPMM swap handlers
 */
export abstract class RaydiumCpmmSwapBaseHandler {
  // 0.25%
  protected static PROTOCOL_FEE = 25n;
  protected static FEE_DENOMINATOR = 10000n;

  constructor(
    protected instruction: Instruction,
    protected block: Block,
    private decodeMethod: 'swapBaseInput' | 'swapBaseOutput',
  ) {}

  abstract handleSwap(): SolanaSwapCore;

  protected getInputAndOutputTokenAmounts(): {
    inputTokenAmount: TokenAmount;
    outputTokenAmount: TokenAmount;
    tokenInAccount: string;
    tokenOutAccount: string;
    authority?: string;
    owner?: string;
  } {
    const { inputToken, outputToken } = this.getTokenData();
    const swapTransfers = getDecodedInnerTransfers(this.instruction, this.block);
    if (swapTransfers.length < 2) {
      throw new Error('Expected 2 decoded transfers accounting for tokenIn and tokenOut');
    }

    const [
      {
        // Transfer instructions take in authority account while TransferChecked instructions take in owner account
        accounts: { destination: tokenInAccount, authority, owner },
        data: { amount: amountInputToken },
      },
      {
        accounts: { source: tokenOutAccount },
        data: { amount: amountOutputToken },
      },
    ] = swapTransfers;

    return {
      authority,
      owner,
      tokenInAccount,
      tokenOutAccount,
      inputTokenAmount: {
        mint: inputToken.mint,
        amount: amountInputToken,
        decimals: inputToken.decimals,
      },
      outputTokenAmount: {
        mint: outputToken.mint,
        amount: amountOutputToken,
        decimals: outputToken.decimals,
      },
    };
  }

  protected getAccounts(): {
    poolAddress: string;
    inputVault: string;
    outputVault: string;
    inputTokenMint: string;
    outputTokenMint: string;
  } {
    const {
      accounts: {
        inputTokenMint,
        outputTokenMint,
        inputVault,
        outputVault,
        poolState: poolAddress,
      },
    } = raydiumCpmm.instructions[this.decodeMethod].decode(this.instruction);

    return {
      poolAddress,
      inputVault,
      outputVault,
      inputTokenMint,
      outputTokenMint,
    };
  }

  protected getTokenData(): { inputToken: Token; outputToken: Token } {
    const { inputVault, outputVault } = this.getAccounts();
    const tokenBalances = getInstructionBalances(this.instruction, this.block);
    const inputVaultTokenBalance = getPostTokenBalance(tokenBalances, inputVault);
    const outputVaultTokenBalance = getPostTokenBalance(tokenBalances, outputVault);

    return {
      inputToken: {
        mint: inputVaultTokenBalance.account,
        decimals: inputVaultTokenBalance.postDecimals,
      },
      outputToken: {
        mint: outputVaultTokenBalance.account,
        decimals: outputVaultTokenBalance.postDecimals,
      },
    };
  }

  protected getPoolPrice(token0: TokenAmount, token1: TokenAmount): number {
    // FIXME: Unsafe conversion to number
    const token0Reserves = Number(token0.amount) / 10 ** token0.decimals;
    const token1Reserves = Number(token1.amount) / 10 ** token1.decimals;
    return token0Reserves / token1Reserves;
  }
}
