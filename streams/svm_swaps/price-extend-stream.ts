import { ClickHouseClient } from '@clickhouse/client';
import {
  getPrice,
  QUOTE_TOKENS,
  sortTokenPair,
  timeIt,
  USD_STABLECOINS,
} from './utils';
import { SolanaSwap, SwappedTokenData } from './types';
import { createLogger } from '../../pipes/utils';
import _ from 'lodash';
import { DbSwap, ExitSummary, TokenPositions } from './util/TokenPositions';
import { Logger } from 'pino';

export type TokenPriceData = {
  poolAddress: string;
  isBestPricingPoolSelected: boolean;
  priceUsdc: number;
};

export type ExtendedSwappedTokenData = SwappedTokenData & {
  priceData?: TokenPriceData;
  balance: number;
  wins: number;
  loses: number;
  positionExitSummary?: ExitSummary;
};

export type ExtendedSolanaSwap = SolanaSwap & {
  baseToken: ExtendedSwappedTokenData;
  quoteToken: ExtendedSwappedTokenData;
};

type TokenPriceDbRow = {
  best_pool_address: string | null;
  pool_address: string;
  token: string;
  price: number;
};

function toStartOfPrevHour(date: Date) {
  const hour = 60 * 60 * 1000;
  const startOfPrevHour = new Date(date.getTime() - hour);
  startOfPrevHour.setUTCMinutes(0, 0, 0);
  return startOfPrevHour;
}

export class PriceExtendStream {
  private logger: Logger;
  // User token holdings map, ie.:
  // `${tokenMintAcc}:${userAcc}` => Positions FIFO queue
  private accountPositions = new Map<string, TokenPositions>();
  // tokenMintAcc => TokenPriceData map
  private tokenPrices = new Map<string, TokenPriceData>();
  // Ending date currently used to select best pricing pools for each token
  private bestPoolMaxDate: Date | undefined;

  constructor(private client: ClickHouseClient) {
    this.logger = createLogger('price-extend-stream');
  }

  private async *refetchTokenPrices(bestPoolMaxDate: Date) {
    const bestPoolTimeInterval = 14 * 24 * 60 * 60 * 1000; // 2 weeks
    // Get latest prices for each token, based on pool chosen from
    // `tokens_with_best_quote_pools` (if exist) or ANY quote pool otherwise.
    const result = await this.client.query({
      query: `
          SELECT
            token,
            pool_address,
            best_pool_address,
            price
          FROM tokens_with_last_prices(
            min_timestamp={minTimestamp:DateTime},
            max_timestamp={maxTimestamp:DateTime}
          )
      `,
      query_params: {
        minTimestamp: new Date(
          bestPoolMaxDate.getTime() - bestPoolTimeInterval
        ),
        maxTimestamp: bestPoolMaxDate,
      },
      format: 'JSONEachRow',
    });

    for await (const rows of result.stream<TokenPriceDbRow>()) {
      for (const row of rows) {
        yield row.json();
      }
    }
  }

  private async reloadTokenPrices(bestPoolMaxDate: Date) {
    this.logger.info(
      `Reloading token prices (best pool max date: ${bestPoolMaxDate.toISOString()})...`
    );
    for await (const row of this.refetchTokenPrices(bestPoolMaxDate)) {
      this.tokenPrices.set(row.token, {
        isBestPricingPoolSelected: row.best_pool_address === row.pool_address,
        poolAddress: row.pool_address,
        priceUsdc: row.price,
      });
    }
    for (const token of USD_STABLECOINS) {
      // For USD stablecoins we always use a static price of 1 USD
      this.tokenPrices.set(token, {
        isBestPricingPoolSelected: true,
        poolAddress: '[NONE]',
        priceUsdc: 1,
      });
    }
    this.bestPoolMaxDate = bestPoolMaxDate;
  }

  private async *refetchTokenPositions() {
    const resp = await this.client.query({
      query: `SELECT
        account,
        token_a,
        token_b,
        amount_a,
        amount_b,
        token_a_usdc_price,
        token_b_usdc_price
      FROM
        solana_swaps_raw;`,
      format: 'JSONEachRow',
    });
    for await (const rows of resp.stream<DbSwap>()) {
      for (const row of rows) {
        yield row.json();
      }
    }
  }

  private async loadTokenPosition(swap: DbSwap) {
    const positionsA = this.getAccountTokenPositions(
      swap.account,
      swap.token_a
    );
    const positionsB = this.getAccountTokenPositions(
      swap.account,
      swap.token_b
    );
    positionsA.load(swap);
    positionsB.load(swap);
  }

  // Convert SwappedTokenData to a ExtendedSwappedTokenData
  // while maintaining type-safety
  private initExtendedSwappedTokenData(
    swappedToken: SwappedTokenData
  ): ExtendedSwappedTokenData {
    return {
      ...swappedToken,
      balance: 0,
      wins: 0,
      loses: 0,
    };
  }

  private getAccountTokenPositions(
    account: string,
    token: string
  ): TokenPositions {
    const key = `${token}:${account}`;
    let positions = this.accountPositions.get(key);
    if (!positions) {
      positions = new TokenPositions(token);
      this.accountPositions.set(key, positions);
      return positions;
    }
    return positions;
  }

  private async processSwap(swap: SolanaSwap): Promise<ExtendedSolanaSwap> {
    const [tokenA, tokenB] = sortTokenPair(swap.input, swap.output);
    const tokenAIsOutputToken = swap.output.mintAcc === tokenA.mintAcc;

    if (
      !this.bestPoolMaxDate ||
      toStartOfPrevHour(swap.timestamp).getTime() !==
        this.bestPoolMaxDate.getTime()
    ) {
      await this.reloadTokenPrices(toStartOfPrevHour(swap.timestamp));
    }

    // FIXME: Unsafe conversion to number
    const amountA = Number(tokenA.amount) / 10 ** tokenA.decimals;
    const amountB = Number(tokenB.amount) / 10 ** tokenB.decimals;

    let priceA = 0;
    let priceB = 0;

    const positionsA = this.getAccountTokenPositions(
      swap.account,
      tokenA.mintAcc
    );
    const positionsB = this.getAccountTokenPositions(
      swap.account,
      tokenB.mintAcc
    );

    let tokenAPriceData = this.tokenPrices.get(tokenA.mintAcc);
    const tokenBPriceData = this.tokenPrices.get(tokenB.mintAcc);
    const tokenBIsAllowedQuote = QUOTE_TOKENS.includes(tokenB.mintAcc);

    if (
      tokenBIsAllowedQuote &&
      tokenBPriceData &&
      (!tokenAPriceData?.isBestPricingPoolSelected ||
        swap.poolAddress === tokenAPriceData.poolAddress) &&
      tokenA.amount !== 0n &&
      tokenB.amount !== 0n
    ) {
      // Update tokenAPriceData
      tokenAPriceData = {
        priceUsdc: getPrice(tokenA, tokenB) * tokenBPriceData.priceUsdc,
        poolAddress: swap.poolAddress,
        isBestPricingPoolSelected:
          tokenAPriceData?.isBestPricingPoolSelected || false,
      };
      this.tokenPrices.set(tokenA.mintAcc, tokenAPriceData);
    }

    priceA = tokenAPriceData?.priceUsdc || 0;
    priceB = tokenBPriceData?.priceUsdc || 0;

    const extTokenA: ExtendedSwappedTokenData =
      this.initExtendedSwappedTokenData(tokenA);
    const extTokenB: ExtendedSwappedTokenData =
      this.initExtendedSwappedTokenData(tokenB);

    extTokenA.priceData = tokenAPriceData;
    extTokenB.priceData = tokenBPriceData;
    extTokenA.amount = tokenAIsOutputToken ? tokenA.amount : -tokenA.amount;
    extTokenB.amount = tokenAIsOutputToken ? -tokenB.amount : tokenB.amount;

    if (tokenAIsOutputToken) {
      // TOKEN A - ENTRY
      positionsA.entry(amountA, priceA);
      // TOKEN B - EXIT
      const exitSummary = positionsB.exit(amountB, priceB);
      extTokenB.positionExitSummary = exitSummary;
    } else {
      // TOKEN A - EXIT
      const exitSummary = positionsA.exit(amountA, priceA);
      extTokenA.positionExitSummary = exitSummary;
      // TOKEN B - ENTRY
      positionsB.entry(amountB, priceB);
    }

    extTokenA.balance = positionsA.totalBalance;
    extTokenB.balance = positionsB.totalBalance;
    extTokenA.wins = positionsA.wins;
    extTokenB.wins = positionsB.wins;
    extTokenA.loses = positionsA.loses;
    extTokenB.loses = positionsB.loses;

    return {
      ...swap,
      baseToken: extTokenA,
      quoteToken: extTokenB,
    };
  }

  async pipe(): Promise<TransformStream<SolanaSwap[], ExtendedSolanaSwap[]>> {
    return new TransformStream({
      start: async () => {
        this.logger.info('Restoring token positions...');
        for await (const row of this.refetchTokenPositions()) {
          this.loadTokenPosition(row);
        }
      },
      transform: async (swaps: SolanaSwap[], controller) =>
        await timeIt(this.logger, 'Extending swaps', async () => {
          const extendedSwaps: ExtendedSolanaSwap[] = [];
          for (const swap of swaps) {
            const extendedSwap = await this.processSwap(swap);
            extendedSwaps.push(extendedSwap);
          }
          controller.enqueue(extendedSwaps);
        }),
    });
  }
}
