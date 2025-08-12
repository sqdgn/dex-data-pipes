import { ClickHouseClient } from '@clickhouse/client';
import { getPrice, QUOTE_TOKENS, sortTokenPair, timeIt, USD_STABLECOINS } from './utils';
import { SolanaSwap, SwappedTokenData } from './types';
import { createLogger } from '../../pipes/utils';
import _ from 'lodash';
import { DbSwap, ExitSummary, TokenPositions } from './util/TokenPositions';
import { Logger } from 'pino';
import { AccountsPositionsCache } from './util/AccountPositionsCache';

export type TokenPriceData = {
  poolAddress: string;
  isBestPricingPoolSelected: boolean;
  priceUsdc: number;
};

export type ExtendedSwappedTokenData = SwappedTokenData & {
  // Pool used to price the token in USDC (if differs from current pool)
  usdcPricingPool?: {
    address: string;
    // Whether the pricing pool is the best (highest volume) pool based on available data
    isBest: boolean;
  };
  priceUsdc: number;
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
  price_usdc: number;
};

function toStartOfPrevHour(date: Date) {
  const hour = 60 * 60 * 1000;
  const startOfPrevHour = new Date(date.getTime() - hour);
  startOfPrevHour.setUTCMinutes(0, 0, 0);
  return startOfPrevHour;
}

// Max. Number of accounts to preload positions for in a single query
const PRELOAD_ACCOUNT_POSITIONS_BATCH_SIZE = 50;

export class PriceExtendStream {
  private logger: Logger;
  // Double map: userAcc -> tokenMintAcc -> TokenPositions (FIFO queue)
  private accountPositions = new AccountsPositionsCache();
  // Cache hit ratio for account positions LRUMap cache
  private cacheHitRatio = { cacheHit: 0, dbHit: 0, miss: 0 };
  // tokenMintAcc => TokenPriceData map
  private tokenPrices = new Map<string, TokenPriceData>();
  // Ending date currently used to select best pricing pools for each token
  private bestPoolMaxDate: Date | undefined;

  constructor(
    private client: ClickHouseClient,
    private cacheDumpPath: string,
  ) {
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
            price_usdc
          FROM tokens_with_last_prices(
            min_timestamp={minTimestamp:DateTime},
            max_timestamp={maxTimestamp:DateTime}
          )
      `,
      query_params: {
        minTimestamp: new Date(bestPoolMaxDate.getTime() - bestPoolTimeInterval),
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
      `Reloading token prices (best pool max date: ${bestPoolMaxDate.toISOString()})...`,
    );
    for await (const row of this.refetchTokenPrices(bestPoolMaxDate)) {
      this.tokenPrices.set(row.token, {
        isBestPricingPoolSelected: row.best_pool_address === row.pool_address,
        poolAddress: row.pool_address,
        priceUsdc: row.price_usdc,
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

  private async *refetchPositions(accounts: string[], fromBlock?: number) {
    for (const accountsChunk of _.chunk(accounts, PRELOAD_ACCOUNT_POSITIONS_BATCH_SIZE)) {
      const result = await timeIt(
        this.logger,
        'Fetching account positions chunk',
        () =>
          this.client.query({
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
              ${fromBlock ? 'AND block_number >= {fromBlock:UInt32}' : ''}
            ORDER BY (account, block_number, transaction_index, instruction_address) ASC`,
            query_params: { accounts: accountsChunk, fromBlock },
            format: 'JSONEachRow',
          }),
        { chunkSize: accountsChunk.length },
      );

      for await (const rows of result.stream<DbSwap>()) {
        for (const row of rows) {
          yield row.json();
        }
      }
    }
  }

  private loadTokenPosition(swap: DbSwap) {
    const positionsA = this.accountPositions.getOrCreateTokenPositions(swap.account, swap.token_a);
    const positionsB = this.accountPositions.getOrCreateTokenPositions(swap.account, swap.token_b);
    positionsA.load(swap, swap.token_a);
    positionsB.load(swap, swap.token_b);
  }

  // Convert SwappedTokenData to a ExtendedSwappedTokenData
  // while maintaining type-safety
  private initExtendedSwappedTokenData(swappedToken: SwappedTokenData): ExtendedSwappedTokenData {
    return {
      ...swappedToken,
      priceUsdc: 0,
      balance: 0,
      wins: 0,
      loses: 0,
    };
  }

  private async getOrLoadTokenPositions(account: string, token: string): Promise<TokenPositions> {
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
      const tokenPositions = this.accountPositions.getOrCreateTokenPositions(account, token);
      return tokenPositions;
    } else {
      ++this.cacheHitRatio.cacheHit;
    }
    // If account positions are already present in cache,
    // we can safely use getOrCreate
    return this.accountPositions.getOrCreateTokenPositions(account, token);
  }

  private async processSwap(swap: SolanaSwap): Promise<ExtendedSolanaSwap> {
    return timeIt(
      this.logger,
      'Process swap inner',
      async () => {
        const [tokenA, tokenB] = timeIt(
          this.logger,
          'Sorting token pair',
          () => sortTokenPair(swap.input, swap.output),
          undefined,
          10000,
          10000,
        );
        const tokenAIsOutputToken = swap.output.mintAcc === tokenA.mintAcc;

        await timeIt(
          this.logger,
          'Checking bestPoolMaxDate',
          async () => {
            if (
              !this.bestPoolMaxDate ||
              toStartOfPrevHour(swap.timestamp).getTime() !== this.bestPoolMaxDate.getTime()
            ) {
              await timeIt(this.logger, 'Reloading token prices', () =>
                this.reloadTokenPrices(toStartOfPrevHour(swap.timestamp)),
              );
            }
          },
          undefined,
          10000,
          10000,
        );

        // FIXME: Unsafe conversion to number
        const { extTokenA, extTokenB, amountA, amountB, tokenBIsAllowedQuote } = timeIt(
          this.logger,
          'Determining prices',
          () => {
            const amountA = Number(tokenA.amount) / 10 ** tokenA.decimals;
            const amountB = Number(tokenB.amount) / 10 ** tokenB.decimals;

            let tokenAPriceData = this.tokenPrices.get(tokenA.mintAcc);
            const tokenBPriceData = this.tokenPrices.get(tokenB.mintAcc);
            const tokenBIsAllowedQuote = QUOTE_TOKENS.includes(tokenB.mintAcc);
            const extTokenA: ExtendedSwappedTokenData = this.initExtendedSwappedTokenData(tokenA);
            const extTokenB: ExtendedSwappedTokenData = this.initExtendedSwappedTokenData(tokenB);

            extTokenB.priceUsdc = tokenBPriceData?.priceUsdc || 0;
            extTokenB.usdcPricingPool = tokenBPriceData
              ? {
                  address: tokenBPriceData.poolAddress,
                  isBest: tokenBPriceData.isBestPricingPoolSelected,
                }
              : undefined;
            if (
              tokenBIsAllowedQuote &&
              extTokenB.priceUsdc &&
              tokenA.amount !== 0n &&
              tokenB.amount !== 0n
            ) {
              // If token B is an allowed quote token and we have its USDC price,
              // we use it to calculate priceAUsdc
              extTokenA.priceUsdc = getPrice(tokenA, tokenB) * extTokenB.priceUsdc;
              // Additionally if there is no best pool for token A
              // or current pool is the best pool, we update token A price in the cache
              if (
                !tokenAPriceData?.isBestPricingPoolSelected ||
                swap.poolAddress === tokenAPriceData.poolAddress
              ) {
                tokenAPriceData = {
                  priceUsdc: extTokenA.priceUsdc,
                  poolAddress: swap.poolAddress,
                  isBestPricingPoolSelected: tokenAPriceData?.isBestPricingPoolSelected || false,
                };
                this.tokenPrices.set(tokenA.mintAcc, tokenAPriceData);
              }
            } else if (tokenAPriceData) {
              // Otherwise we use last known best pool price of token A
              extTokenA.priceUsdc = tokenAPriceData.priceUsdc;
              extTokenA.usdcPricingPool = {
                address: tokenAPriceData.poolAddress,
                isBest: tokenAPriceData.isBestPricingPoolSelected,
              };
            }

            extTokenA.amount = tokenAIsOutputToken ? tokenA.amount : -tokenA.amount;
            extTokenB.amount = tokenAIsOutputToken ? -tokenB.amount : tokenB.amount;

            return { extTokenA, extTokenB, amountA, amountB, tokenBIsAllowedQuote };
          },
          undefined,
          10000,
          10000,
        );

        // For now we only process positions against allowed quote tokens
        if (tokenBIsAllowedQuote && amountA > 0 && amountB > 0) {
          const positions = await timeIt(
            this.logger,
            'Get/load token positions',
            async () => ({
              a: await this.getOrLoadTokenPositions(swap.account, tokenA.mintAcc),
              b: await this.getOrLoadTokenPositions(swap.account, tokenB.mintAcc),
            }),
            undefined,
            10000,
            10000,
          );

          timeIt(
            this.logger,
            'Processing positions',
            () => {
              if (tokenAIsOutputToken) {
                // TOKEN A - ENTRY
                positions.a.entry(amountA, extTokenA.priceUsdc);
                // TOKEN B - EXIT
                const exitSummary = positions.b.exit(amountB, extTokenB.priceUsdc);
                extTokenB.positionExitSummary = exitSummary;
              } else {
                // TOKEN A - EXIT
                const exitSummary = positions.a.exit(amountA, extTokenA.priceUsdc);
                extTokenA.positionExitSummary = exitSummary;
                // TOKEN B - ENTRY
                positions.b.entry(amountB, extTokenB.priceUsdc);
              }
              extTokenA.balance = positions.a.totalBalance;
              extTokenB.balance = positions.b.totalBalance;
              extTokenA.wins = positions.a.wins;
              extTokenB.wins = positions.b.wins;
              extTokenA.loses = positions.a.loses;
              extTokenB.loses = positions.b.loses;
            },
            undefined,
            10000,
            10000,
          );
        }

        const res = timeIt(
          this.logger,
          'Preparing res',
          () => ({
            ...swap,
            baseToken: extTokenA,
            quoteToken: extTokenB,
          }),
          undefined,
          10000,
          10000,
        );
        return res;
      },
      undefined,
      10000,
      10000,
    );
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
          4,
        ),
    );
    // Reset stats every iteration
    this.cacheHitRatio = { cacheHit: 0, dbHit: 0, miss: 0 };
  }

  private async preloadMissingAccountPositions(swaps: SolanaSwap[]) {
    // Init accountPositions cache first if not initialized yet
    if (!this.accountPositions.loaded) {
      const [firstSwap] = swaps;
      await this.accountPositions.loadFromFile(this.cacheDumpPath, firstSwap.block.number - 1);
      if (this.accountPositions.lastDumpBlock) {
        await this.preloadAccountPositions(
          [...this.accountPositions.keys()],
          this.accountPositions.lastDumpBlock + 1,
        );
      }
    }
    // Find missing accounts
    const filteredSwaps = swaps.filter(
      (s) =>
        // For now we don't track positions for swaps where neither of the toknes can be found in `QUOTE_TOKENS`
        (QUOTE_TOKENS.includes(s.input.mintAcc) || QUOTE_TOKENS.includes(s.output.mintAcc)) &&
        // We also don't care about swaps that have one of the token amounts === 0
        s.input.amount > 0 &&
        s.output.amount > 0,
    );
    const missingAccounts = _.uniq(filteredSwaps.map((s) => s.account)).filter(
      (a) => !this.accountPositions.has(a),
    );
    // First we populate this.accountPositions with empty maps for
    // each of the missing accounts, because we still want to mark all of
    // them as "loaded into cache", even if they didn't make any swaps yet.
    // (so that they are not redundantly re-fetched later)
    for (const account of missingAccounts) {
      this.accountPositions.set(account, new Map());
    }
    // Now we populate the cache with the actual data
    await this.preloadAccountPositions(missingAccounts);
  }

  private async preloadAccountPositions(accounts: string[], fromBlock?: number) {
    await timeIt(this.logger, 'Preloading positions', async () => {
      const foundAccounts = new Set<string>();
      let positionsCount = 0;
      for await (const dbSwap of this.refetchPositions(accounts, fromBlock)) {
        foundAccounts.add(dbSwap.account);
        this.loadTokenPosition(dbSwap);
        positionsCount += 2;
      }
      this.logger.debug(
        `Preloaded ${positionsCount} positions for ${accounts.length} accounts ` +
          (fromBlock ? `starting from block ${fromBlock} ` : '') +
          `(${foundAccounts.size} accounts were found in db)`,
      );
    });
  }

  async pipe(): Promise<TransformStream<SolanaSwap[], ExtendedSolanaSwap[]>> {
    return new TransformStream({
      transform: async (swaps: SolanaSwap[], controller) => {
        await timeIt(this.logger, 'Extending swaps', async () => {
          const extendedSwaps: ExtendedSolanaSwap[] = [];
          await this.preloadMissingAccountPositions(swaps);
          await timeIt(this.logger, 'Process swap loop', async () => {
            for (const swap of swaps) {
              await timeIt(
                this.logger,
                'Processing single swap',
                async () => {
                  const extendedSwap = await this.processSwap(swap);
                  extendedSwaps.push(extendedSwap);
                },
                undefined,
                10000,
                10000,
              );
            }
          });
          this.logAndResetCacheStats();
          const [lastSwap] = swaps.slice(-1);
          this.accountPositions.dumpIfNeeded(this.cacheDumpPath, lastSwap.block.number);
          controller.enqueue(extendedSwaps);
        });
      },
    });
  }
}
