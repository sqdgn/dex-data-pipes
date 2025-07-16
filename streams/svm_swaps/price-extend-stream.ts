import { ClickHouseClient } from '@clickhouse/client';
import { getPrice, sortTokenPair, TOKENS } from './utils';
import { SolanaSwap, SwappedTokenData } from './types';

export type ExtendedSwappedTokenData = SwappedTokenData & {
  usdcPrice: number;
  balance: number;
  profitUsdc: number;
  costUsdc: number;
  tokenAcquisitionCostUsd: number;
};

export type ExtendedSolanaSwap = SolanaSwap & {
  baseToken: ExtendedSwappedTokenData;
  quoteToken: ExtendedSwappedTokenData;
};

export class PriceExtendStream {
  constructor(private client?: ClickHouseClient) {}

  private async *restoreTokenPrices() {
    if (!this.client) return;

    // Get latest token prices from swaps where one token is USDC
    // TODO: And amount_a !=0 and amount_b != 0?
    const result = await this.client.query({
      query: `
        SELECT token_a as token, token_a_usdc_price as price
        FROM solana_swaps_raw
        WHERE token_a = '${TOKENS.SOL}'
          AND token_b = '${TOKENS.USDC}'
          AND sign > 0
        ORDER BY timestamp DESC
        LIMIT 1
      `,
      format: 'JSONEachRow',
    });

    for await (const rows of result.stream<{
      token: string;
      price: number;
    }>()) {
      for (const row of rows) {
        yield row.json();
      }
    }
  }

  // Convert SwappedTokenData to a ExtendedSwappedTokenData
  // while maintaining type-safety
  private initExtendedSwappedTokenData(
    swappedToken: SwappedTokenData
  ): ExtendedSwappedTokenData {
    return {
      ...swappedToken,
      usdcPrice: 0,
      balance: 0,
      profitUsdc: 0,
      costUsdc: 0,
      tokenAcquisitionCostUsd: 0,
    };
  }

  private async *restoreAccountHoldings() {
    if (!this.client) return;

    // Get the latest account holdings from daily aggregated data
    // FIXME: Why do we use maxMerge for acquisition_cost_usd, not anyLastMerge?
    const result = await this.client.query({
      query: `
        SELECT 
          token,
          account,
          anyLastMerge(balance) as balance,
          maxMerge(acquisition_cost_usd) as acquisition_cost
        FROM solana_account_trades_daily
        GROUP BY token, account
      `,
      format: 'JSONEachRow',
    });

    interface AccountHolding {
      token: string;
      account: string;
      balance: number;
      acquisition_cost: number;
    }

    for await (const rows of result.stream<AccountHolding>()) {
      for (const row of rows) {
        yield row.json();
      }
    }
  }

  async pipe(): Promise<TransformStream<SolanaSwap[], ExtendedSolanaSwap[]>> {
    // tokenMintAcc => priceInUsdc map
    const tokenPrices = new Map<string, number>();
    // User token holdings map, ie.:
    // `${tokenMintAcc}:${userAcc}` => { amount, weightedPrice }
    const accountPairs = new Map<
      string,
      { amount: number; weightedPrice: number }
    >();

    return new TransformStream({
      start: async () => {
        for await (const row of this.restoreTokenPrices()) {
          tokenPrices.set(row.token, row.price);
        }

        for await (const row of this.restoreAccountHoldings()) {
          accountPairs.set(`${row.token}:${row.account}`, {
            amount: row.balance,
            weightedPrice: row.acquisition_cost,
          });
        }
      },
      transform: (swaps: SolanaSwap[], controller) => {
        const extendedSwaps: ExtendedSolanaSwap[] = swaps.map((swap) => {
          const [tokenA, tokenB] = sortTokenPair(swap.input, swap.output);
          const tokenAIsOutputToken = swap.output.mintAcc === tokenA.mintAcc;

          // FIXME: Unsafe conversion to number
          const amountA = Number(tokenA.amount) / 10 ** tokenA.decimals;
          const amountB = Number(tokenB.amount) / 10 ** tokenB.decimals;

          let priceA = 0;
          let priceB = 0;

          const holdingA = accountPairs.get(
            `${tokenA.mintAcc}:${swap.account}`
          ) || {
            amount: 0,
            weightedPrice: 0,
          };
          const holdingB = accountPairs.get(
            `${tokenB.mintAcc}:${swap.account}`
          ) || {
            amount: 0,
            weightedPrice: 0,
          };

          if (
            // FIXME: Why we're not using USDS in QUOTE_TOKENS then? Perhaps ask EF.
            tokenB.mintAcc === TOKENS.USDC ||
            tokenB.mintAcc === TOKENS.USDT ||
            tokenB.mintAcc === TOKENS.USDS
          ) {
            priceA = getPrice(tokenA, tokenB);
            priceB = 1;

            if (tokenA.mintAcc === TOKENS.SOL) {
              tokenPrices.set(tokenA.mintAcc, priceA);
            }
          } else if (tokenB.mintAcc === TOKENS.SOL) {
            const priceRelativeToSol = getPrice(tokenA, tokenB);
            const latestSolUsdcPrice = tokenPrices.get(TOKENS.SOL) || 0;

            priceA = latestSolUsdcPrice * priceRelativeToSol;
            priceB = latestSolUsdcPrice;
          }

          const extTokenA: ExtendedSwappedTokenData =
            this.initExtendedSwappedTokenData(tokenA);
          const extTokenB: ExtendedSwappedTokenData =
            this.initExtendedSwappedTokenData(tokenB);

          extTokenA.usdcPrice = priceA;
          extTokenB.usdcPrice = priceB;
          extTokenA.amount = tokenAIsOutputToken
            ? tokenA.amount
            : -tokenA.amount;
          extTokenB.amount = tokenAIsOutputToken
            ? -tokenB.amount
            : tokenB.amount;

          if (tokenAIsOutputToken) {
            extTokenA.balance = holdingA.amount + amountA;
            extTokenA.profitUsdc = 0;
            extTokenA.costUsdc = 0;
            extTokenA.tokenAcquisitionCostUsd =
              (holdingA.amount * holdingA.weightedPrice + amountA * priceA) /
              extTokenA.balance;
          } else {
            extTokenA.balance = Math.max(holdingA.amount - amountA, 0);
            extTokenA.profitUsdc =
              Math.min(holdingA.amount, amountA) *
              (priceA - holdingA.weightedPrice);
            extTokenA.costUsdc =
              Math.min(holdingA.amount, amountA) * holdingA.weightedPrice;
            extTokenA.tokenAcquisitionCostUsd = holdingA.weightedPrice;
          }
          holdingA.weightedPrice = extTokenA.tokenAcquisitionCostUsd;
          holdingA.amount = extTokenA.balance;
          accountPairs.set(`${extTokenA.mintAcc}:${swap.account}`, holdingA);

          if (!tokenAIsOutputToken) {
            extTokenB.balance = holdingB.amount + amountB;
            extTokenB.profitUsdc = 0;
            extTokenB.costUsdc = 0;
            extTokenB.tokenAcquisitionCostUsd =
              (holdingB.amount * holdingB.weightedPrice + amountB * priceB) /
              extTokenB.balance;
          } else {
            extTokenB.balance = Math.max(holdingB.amount - amountB, 0);
            extTokenB.profitUsdc =
              Math.min(holdingB.amount, amountB) *
              (priceB - holdingB.weightedPrice);
            extTokenB.costUsdc =
              Math.min(holdingB.amount, amountB) * holdingB.weightedPrice;
            extTokenB.tokenAcquisitionCostUsd = holdingB.weightedPrice;
          }

          holdingB.weightedPrice = extTokenB.tokenAcquisitionCostUsd;
          holdingB.amount = extTokenB.balance;
          accountPairs.set(`${extTokenB.mintAcc}:${swap.account}`, holdingB);

          return {
            ...swap,
            baseToken: extTokenA,
            quoteToken: extTokenB,
          };
        });

        controller.enqueue(extendedSwaps);
      },
    });
  }
}
