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
import { LRUMap } from './util/LRUMap';

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

// We limit LRU cache for account positions to 100_000
// most recently used accounts.
const ACCOUNT_POSITIONS_MAP_CAPACITY = 100_000;

export class PriceExtendStream {
  private logger: Logger;
  // Double map: userAcc -> tokenMintAcc -> TokenPositions (FIFO queue)
  private accountPositions = new LRUMap<string, Map<string, TokenPositions>>(
    ACCOUNT_POSITIONS_MAP_CAPACITY
  );
  // Cache hit ratio for account positions LRUMap cache
  private cacheHitRatio = { cacheHit: 0, dbHit: 0, miss: 0 };
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

  private async *refetchPositions(accounts: string[]) {
    const result = await this.client.query({
      query: `SELECT
        account,
        token_a,
        token_b,
        amount_a,
        amount_b,
        token_a_usdc_price,
        token_b_usdc_price
      FROM
        account_token_positions
      WHERE
        sign > 0
        AND account IN {accounts:Array(String)}
      ORDER BY (account, block_number, transaction_index, instruction_address) ASC`,
      query_params: { accounts },
      format: 'JSONEachRow',
    });

    for await (const rows of result.stream<DbSwap>()) {
      for (const row of rows) {
        yield row.json();
      }
    }
  }

  private loadTokenPosition(swap: DbSwap) {
    const positionsA = this.getOrCreateTokenPositions(
      swap.account,
      swap.token_a
    );
    const positionsB = this.getOrCreateTokenPositions(
      swap.account,
      swap.token_b
    );
    positionsA.load(swap, swap.token_a);
    positionsB.load(swap, swap.token_b);
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

  private getOrCreateTokenPositions(
    account: string,
    token: string
  ): TokenPositions {
    let accountPositions = this.accountPositions.get(account);
    if (!accountPositions) {
      accountPositions = new Map();
      this.accountPositions.set(account, accountPositions);
    }
    let tokenPositions = accountPositions.get(token);
    if (!tokenPositions) {
      tokenPositions = new TokenPositions();
      accountPositions.set(token, tokenPositions);
    }
    return tokenPositions;
  }

  private async getOrLoadTokenPositions(
    account: string,
    token: string
  ): Promise<TokenPositions> {
    const accountPositions = this.accountPositions.get(account);
    if (!accountPositions) {
      // Account positions not found in cache.
      // Try to reload from DB first...
      let dbHit = false;
      for await (const dbSwap of this.refetchPositions([account])) {
        dbHit = true;
        this.loadTokenPosition(dbSwap);
      }
      if (dbHit) {
        ++this.cacheHitRatio.dbHit;
      } else {
        ++this.cacheHitRatio.miss;
      }
      // ...then use getOrCreate for this specific token
      const tokenPositions = this.getOrCreateTokenPositions(account, token);
      return tokenPositions;
    } else {
      ++this.cacheHitRatio.cacheHit;
    }
    // If account positions are already present in cache,
    // we can safely use getOrCreate
    return this.getOrCreateTokenPositions(account, token);
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

    // For now we only process positions against allowed quote tokens
    if (tokenBIsAllowedQuote) {
      const positions = {
        a: await this.getOrLoadTokenPositions(swap.account, tokenA.mintAcc),
        b: await this.getOrLoadTokenPositions(swap.account, tokenB.mintAcc),
      };

      if (tokenAIsOutputToken) {
        // TOKEN A - ENTRY
        positions.a.entry(amountA, priceA);
        // TOKEN B - EXIT
        const exitSummary = positions.b.exit(amountB, priceB);
        extTokenB.positionExitSummary = exitSummary;
      } else {
        // TOKEN A - EXIT
        const exitSummary = positions.a.exit(amountA, priceA);
        extTokenA.positionExitSummary = exitSummary;
        // TOKEN B - ENTRY
        positions.b.entry(amountB, priceB);
      }
      extTokenA.balance = positions.a.totalBalance;
      extTokenB.balance = positions.b.totalBalance;
      extTokenA.wins = positions.a.wins;
      extTokenB.wins = positions.b.wins;
      extTokenA.loses = positions.a.loses;
      extTokenB.loses = positions.b.loses;
    }

    return {
      ...swap,
      baseToken: extTokenA,
      quoteToken: extTokenB,
    };
  }

  private logAndResetCacheStats() {
    const { cacheHit, dbHit, miss } = this.cacheHitRatio;
    const size = this.accountPositions.size;
    this.logger.debug(
      `Cache stats: ` +
        JSON.stringify(
          {
            size,
            ...this.cacheHitRatio,
            cacheHitRatio: cacheHit / (cacheHit + dbHit + miss),
            cacheToDbHitRatio: cacheHit / (cacheHit + dbHit),
          },
          null,
          4
        )
    );
    // Reset stats every iteration
    this.cacheHitRatio = { cacheHit: 0, dbHit: 0, miss: 0 };
  }

  private async preloadMissingAccountPositions(swaps: SolanaSwap[]) {
    const filteredSwaps = swaps.filter(
      // For now we don't track positions for swaps where neither of the toknes can be found in `QUOTE_TOKENS`
      (s) =>
        QUOTE_TOKENS.includes(s.input.mintAcc) ||
        QUOTE_TOKENS.includes(s.output.mintAcc)
    );
    const missingAccounts = _.uniq(filteredSwaps.map((s) => s.account)).filter(
      (a) => !this.accountPositions.has(a)
    );
    const foundAccounts = new Set<string>();
    // First we populate this.accountPositions with empty maps for
    // each of the missing accounts, because we still want to mark all of
    // them as "loaded into cache", even if they didn't make any swaps yet.
    // (so that they are not redundantly re-fetched later)
    for (const account of missingAccounts) {
      this.accountPositions.set(account, new Map());
    }
    // Now we populate the cache with the actual data
    for await (const dbSwap of this.refetchPositions(missingAccounts)) {
      foundAccounts.add(dbSwap.account);
      this.loadTokenPosition(dbSwap);
    }
    this.logger.debug(
      `Preloaded positions for ${missingAccounts.length} missing accounts. ${foundAccounts.size} were found in db.`
    );
  }

  async pipe(): Promise<TransformStream<SolanaSwap[], ExtendedSolanaSwap[]>> {
    return new TransformStream({
      start: async () => {
        // Does nothing rn...
      },
      transform: async (swaps: SolanaSwap[], controller) => {
        await timeIt(this.logger, 'Extending swaps', async () => {
          const extendedSwaps: ExtendedSolanaSwap[] = [];
          await timeIt(this.logger, 'Preloading positions', async () => {
            await this.preloadMissingAccountPositions(swaps);
          });
          for (const swap of swaps) {
            const extendedSwap = await this.processSwap(swap);
            extendedSwaps.push(extendedSwap);
          }
          this.logAndResetCacheStats();
          controller.enqueue(extendedSwaps);
        });
      },
    });
  }
}
