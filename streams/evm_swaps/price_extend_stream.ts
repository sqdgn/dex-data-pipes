import assert from 'assert';
import _ from 'lodash';
import { createLogger } from '../../pipes/utils';
import { ClickHouseClient } from '@clickhouse/client';
import { EvmSwap, ExtendedEvmSwap } from './swap_types';
import { Network } from './networks';
import {
  needSwap,
  ReferenceToken,
  referenceTokens,
  ReferenceTokenWithPrice,
  USDC_TOKEN_ADDRESS,
} from './reference_tokens';
import { LRUMap } from './util/LRUMap';
import { DbSwap, TokenPositions } from './util/TokenPositions';
import { Logger } from 'pino';
import { inspect } from 'util';
import { chRetry } from '../../common/chRetry';
import { Profiler } from './util/Profiler';

export class PriceExtendStream {
  private readonly refTokenPriceHistoryLen = 10;
  private profiler = new Profiler(60_000);

  private refPricesTokenUsdc = new Map<string, ReferenceTokenWithPrice[]>();

  // Double map: account (wallet) -> token -> TokenPositions (FIFO queue)
  private accountPositions = new LRUMap<string, Map<string, TokenPositions>>(2_000_000);

  private readonly STATS_PRINT_INTERVAL_MS = 60_000;

  constructor(
    private client: ClickHouseClient,
    private network: Network,
    private logger: Logger,
  ) {
    assert(referenceTokens[network], `reference tokens must be defined for ${network}`);
  }

  private totalRefetchPositionCalls = 0;
  private totalPositionsRecordsRefetched = 0;

  private totalMissingAccountInCacheRequested = 0;
  private totalFoundAccountsLoaded = 0;

  private lastRefetchPositionCalls = 0;
  private lastMissingAccountsRequested = 0;
  private lastFoundAccountsLoaded = 0;
  private lastPositionRecordsRefetched = 0;

  private lastAccountStatsPrinted = Date.now();
  private cacheHitRatio = { cacheHit: 0, cacheMiss: 0 };

  private async preloadMissingAccountPositions(swaps: EvmSwap[]) {
    const filteredSwaps = swaps.filter(
      (s) =>
        referenceTokens[this.network].findIndex(
          (refTok) =>
            refTok.tokenAddress === s.tokenA.address || refTok.tokenAddress === s.tokenB.address,
        ) !== -1,
    );

    const uniqueSwapAccounts = _.uniq(filteredSwaps.map((s) => s.account));

    const missingAccountsInCache: string[] = [];
    for (const acc of uniqueSwapAccounts) {
      if (this.accountPositions.has(acc)) {
        this.cacheHitRatio.cacheHit++;
      } else {
        missingAccountsInCache.push(acc);
        this.cacheHitRatio.cacheMiss++;
      }
    }

    this.totalMissingAccountInCacheRequested += missingAccountsInCache.length;

    for (const account of missingAccountsInCache) {
      this.accountPositions.set(account, new Map());
    }
    const foundAccounts = new Set<string>();

    const CHUNK_SIZE = 100;
    for (let i = 0; i < missingAccountsInCache.length; i += CHUNK_SIZE) {
      const chunk = missingAccountsInCache.slice(i, i + CHUNK_SIZE);

      const dbSwaps = await this.profiler.profile('preload:refetchSwaps', () =>
        this.refetchPositionsSwaps(chunk),
      );

      this.profiler.profileSync('load_swaps_into_cache', () => {
        for (const dbSwap of dbSwaps) {
          foundAccounts.add(dbSwap.account);

          this.profiler.profileSync('single_swap_cache', () => {
            this.loadTokenPosition(dbSwap);
          });
        }
      });
    }

    this.totalFoundAccountsLoaded += foundAccounts.size;

    if (Date.now() - this.lastAccountStatsPrinted >= this.STATS_PRINT_INTERVAL_MS) {
      const intervalSeconds = (Date.now() - this.lastAccountStatsPrinted) / 1000;
      const missingRate =
        (this.totalMissingAccountInCacheRequested - this.lastMissingAccountsRequested) /
        intervalSeconds;
      const foundRate =
        (this.totalFoundAccountsLoaded - this.lastFoundAccountsLoaded) / intervalSeconds;

      const refetchedCallsRate =
        (this.totalRefetchPositionCalls - this.lastRefetchPositionCalls) / intervalSeconds;

      const refetchedRate =
        (this.totalPositionsRecordsRefetched - this.lastPositionRecordsRefetched) / intervalSeconds;

      this.logger.info(
        `Stats: missing=${this.totalMissingAccountInCacheRequested} (${missingRate.toFixed(1)}/s), ` +
          `found=${this.totalFoundAccountsLoaded} (${foundRate.toFixed(1)}/s), ` +
          `refetchedCalls=${this.totalRefetchPositionCalls} (${refetchedCallsRate.toFixed(1)}/s), ` +
          `refetchedRecs=${this.totalPositionsRecordsRefetched} (${refetchedRate.toFixed(1)}/s), ` +
          `totalAcc=${this.accountPositions.size}, ` +
          `cacheHit=${this.cacheHitRatio.cacheHit}, ` +
          `cacheMiss=${this.cacheHitRatio.cacheMiss}`,
      );

      // Store current values for next rate calculation
      this.lastMissingAccountsRequested = this.totalMissingAccountInCacheRequested;
      this.lastFoundAccountsLoaded = this.totalFoundAccountsLoaded;
      this.lastPositionRecordsRefetched = this.totalPositionsRecordsRefetched;
      this.lastRefetchPositionCalls = this.totalRefetchPositionCalls;
      this.lastAccountStatsPrinted = Date.now();
    }
  }

  private getOrCreateTokenPositions(account: string, token: string): TokenPositions {
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

  private async refetchPositionsSwaps(accounts: string[]) {
    const dbSwaps = await chRetry(this.logger, 'refetchPositionsSwaps', async () => {
      const res: DbSwap[] = [];
      for await (const dbSwap of this.refetchPositions(accounts)) {
        res.push(dbSwap);
      }
      return res;
    });
    this.totalRefetchPositionCalls++;
    this.totalPositionsRecordsRefetched += dbSwaps.length;
    return dbSwaps;
  }

  private async *refetchPositions(accounts: string[]) {
    const result = await this.client.query({
      query: `SELECT
        account,
        token_a,
        token_b,
        amount_a,
        amount_b,
        price_token_a_usdc,
        price_token_b_usdc
      FROM
        swaps_raw_account_gr
      WHERE
        sign > 0
        AND account IN {accounts:Array(String)}
      ORDER BY (account, timestamp, transaction_index, log_index) ASC`,
      query_params: { accounts },
      format: 'JSONEachRow',
    });

    for await (const rows of result.stream<DbSwap>()) {
      for (const row of rows) {
        yield row.json();
      }
    }
  }

  private async getOrLoadTokenPositions(account: string, token: string): Promise<TokenPositions> {
    const accountPositions = this.accountPositions.get(account);
    if (!accountPositions) {
      const dbSwaps = await this.profiler.profile('getOrLoadTokenPositions: refetchPosSwaps', () =>
        this.refetchPositionsSwaps([account]),
      );

      for (const dbSwap of dbSwaps) {
        this.profiler.profileSync('getOrLoadTokenPositions: loadTokenPosition', () =>
          this.loadTokenPosition(dbSwap),
        );
      }

      // ...then use getOrCreate for this specific token
      const tokenPositions = this.getOrCreateTokenPositions(account, token);
      return tokenPositions;
    } else {
      this.cacheHitRatio.cacheHit++;
    }
    // If account positions are already present in cache,
    // we can safely use getOrCreate
    return this.getOrCreateTokenPositions(account, token);
  }

  private loadTokenPosition(swap: DbSwap) {
    const positionsA = this.getOrCreateTokenPositions(swap.account, swap.token_a);
    const positionsB = this.getOrCreateTokenPositions(swap.account, swap.token_b);
    positionsA.load(swap, swap.token_a);
    positionsB.load(swap, swap.token_b);
  }

  // Loads price for ref token (token_a) where it is swapped with "more" referency token (token_b).
  // E.g., when loading token price for VIRTUAL it will be token_a and WETH will be token_b (via corresponding pool).
  private async loadRefTokenPrices(refToken: ReferenceToken) {
    const result = await this.client.query({
      query: `
          SELECT token_b as tokenAddress, price_token_a_usdc as priceTokenUsdc, pool_address AS poolAddress, timestamp
          FROM swaps_raw_pool_gr
          WHERE pool_address = '${refToken.poolAddress}'
            AND token_a = '${refToken.tokenAddress}'
            AND sign > 0
          ORDER BY timestamp DESC
          LIMIT ${this.refTokenPriceHistoryLen}
        `,
      format: 'JSONEachRow',
    });

    const res: ReferenceTokenWithPrice[] = [];
    for await (const rows of result.stream<ReferenceTokenWithPrice>()) {
      for (const row of rows) {
        res.push({ ...row.json() } satisfies ReferenceTokenWithPrice);
      }
    }
    return res;
  }

  private needSwap(token_a: string, token_b: string) {
    return needSwap(this.network, token_a, token_b);
  }

  private async processSwap(inputSwap: EvmSwap): Promise<ExtendedEvmSwap> {
    const swap: ExtendedEvmSwap = {
      ...inputSwap,
      price_token_a_usdc: 0,
      price_token_b_usdc: 0,
      a_b_swapped: false,
      token_a_balance: 0,
      token_b_balance: 0,
      token_a_profit_usdc: 0,
      token_b_profit_usdc: 0,
      token_a_cost_usdc: 0,
      token_b_cost_usdc: 0,
      token_a_wins: 0,
      token_b_wins: 0,
      token_a_loses: 0,
      token_b_loses: 0,
    };

    if (this.needSwap(swap.tokenA.address, swap.tokenB.address)) {
      [swap.tokenA, swap.tokenB] = [swap.tokenB, swap.tokenA];
      swap.a_b_swapped = true;
    }

    const refToTokenInfo = this.profiler.profileSync('refToTokenInfo', () =>
      referenceTokens[this.network]?.find((t) => t.tokenAddress === swap.tokenB.address),
    );

    const isWrongValue = (n: number) => Number.isNaN(n) || n === undefined || n === null;

    if (
      !refToTokenInfo || // not a swap to reference token
      swap.tokenA.amount_raw === 0n || // or either amount is zero – cannot calculate price
      swap.tokenB.amount_raw === 0n ||
      swap.tokenA.amount_raw < 0n === swap.tokenB.amount_raw < 0n // both amounts of same sign - error but it happens
      // isWrongValue(swap.tokenA.amount_human) || // sometimes we can miss token data due to decimal load error - just ignore it.
      // isWrongValue(swap.tokenB.amount_human)
    ) {
      swap.price_token_a_usdc = 0;
      swap.price_token_b_usdc = 0;
      return swap;
    }

    if (swap.tokenB.address === USDC_TOKEN_ADDRESS[this.network]) {
      if (Math.abs(swap.tokenB.amount_human) < 0.1 || Math.abs(swap.tokenB.amount_human) > 10000) {
        // don't calculate for too small and too large USDC amounts
        swap.price_token_a_usdc = 0;
        swap.price_token_b_usdc = 0;
        return swap;
      }

      // swap with usdc
      swap.price_token_b_usdc = 1;
    } else {
      const histPrices = this.refPricesTokenUsdc.get(swap.tokenB.address);
      assert.ok(histPrices, 'historical prices must be loaded, init error');

      if (histPrices.length < this.refTokenPriceHistoryLen) {
        // not enough prices ref token in usdc to calc token_a usd price.
        swap.price_token_a_usdc = 0;
        swap.price_token_b_usdc = 0;
        return swap;
      }
      swap.price_token_b_usdc = median(histPrices);
    }

    swap.price_token_a_usdc =
      (Math.abs(swap.tokenB.amount_human) / Math.abs(swap.tokenA.amount_human)) *
      swap.price_token_b_usdc;

    const refFromTokenInfo = this.profiler.profileSync('refFromTokenInfo', () =>
      referenceTokens[this.network]?.find((t) => t.tokenAddress === swap.tokenA.address),
    );

    if (refFromTokenInfo && swap.pool.address === refFromTokenInfo.poolAddress) {
      this.profiler.profileSync('refPriceUpdate', () => {
        const historicalPrices = this.refPricesTokenUsdc.get(swap.tokenA.address)!;
        historicalPrices.unshift({
          poolAddress: refToTokenInfo.poolAddress,
          priceTokenUsdc: swap.price_token_a_usdc,
          timestamp: Date.now(),
          tokenAddress: swap.tokenA.address,
        });

        while (historicalPrices.length > this.refTokenPriceHistoryLen) {
          historicalPrices.pop();
        }
      });
    }

    const [positionsA, positionsB] = await this.profiler.profile('load_positions', async () => {
      const posA = await chRetry(
        this.logger,
        'getOrLoadTokenPositionsA',
        async () => await this.getOrLoadTokenPositions(swap.account, swap.tokenA.address),
      );
      const posB = await chRetry(
        this.logger,
        'getOrLoadTokenPositionsB',
        async () => await this.getOrLoadTokenPositions(swap.account, swap.tokenB.address),
      );
      return [posA, posB];
    });

    if (swap.tokenA.amount_human < 0) {
      this.profiler.profileSync('entry_position', () => {
        positionsA.entry(-swap.tokenA.amount_human, swap.price_token_a_usdc);
      });
      const exitB = this.profiler.profileSync('exit_position', () =>
        positionsB.exit(swap.tokenB.amount_human, swap.price_token_b_usdc),
      );
      swap.token_b_cost_usdc = exitB.entryCostUsdc;
      swap.token_b_profit_usdc = exitB.profitUsdc;
    } else {
      this.profiler.profileSync('entry_position', () => {
        positionsB.entry(-swap.tokenB.amount_human, swap.price_token_b_usdc);
      });
      const exitA = this.profiler.profileSync('exit_position', () =>
        positionsA.exit(swap.tokenA.amount_human, swap.price_token_a_usdc),
      );
      swap.token_a_cost_usdc = exitA.entryCostUsdc;
      swap.token_a_profit_usdc = exitA.profitUsdc;
    }
    swap.token_a_balance = positionsA.totalBalance;
    swap.token_a_wins = positionsA.wins;
    swap.token_a_loses = positionsA.loses;
    swap.token_b_balance = positionsB.totalBalance;
    swap.token_b_wins = positionsB.wins;
    swap.token_b_loses = positionsB.loses;

    return swap;
  }

  private firstTransformStarted = false;
  private processSwapTotalCount = 0;
  private processSwapTotalTime = 0;
  private processSwapStart = 0;

  async pipe(): Promise<TransformStream<EvmSwap[], ExtendedEvmSwap[]>> {
    return new TransformStream({
      start: async () => {
        for (const refToken of referenceTokens[this.network]!) {
          const prices = await this.loadRefTokenPrices(refToken);
          this.refPricesTokenUsdc.set(refToken.tokenAddress, prices);
        }
      },
      transform: async (swaps: EvmSwap[], controller) => {
        if (!this.firstTransformStarted) {
          this.firstTransformStarted = true;
          this.logger.info('price_extend_stream: firstTransformStarted');
        }
        await this.profiler.profile('preloadMissingAccPos', () =>
          this.preloadMissingAccountPositions(swaps),
        );

        const swapsRes: ExtendedEvmSwap[] = new Array(swaps.length);

        if (!this.processSwapStart) {
          this.processSwapStart = Date.now();
          setInterval(() => {
            if (this.processSwapTotalCount === 0) return;
            const avg = this.processSwapTotalTime / this.processSwapTotalCount;
            this.logger.info(
              `processSwap count: ${this.processSwapTotalCount}, avg: ${avg.toFixed(3)} ms, total: ${Math.floor(this.processSwapTotalTime / 1000)} s.`,
            );
          }, 60_000);
        }

        for (let i = 0; i < swaps.length; i++) {
          const s = swaps[i];
          const start = Date.now();
          try {
            this.processSwapTotalCount++;
            await this.profiler.profile('process_swap_total', async () => {
              swapsRes[i] = await this.processSwap(s);
            });
          } catch (err) {
            this.logger.error(`processSwap: ${inspect(s).replace('\n', ' ')}`); // print 1-liner to save space
            throw err;
          } finally {
            this.processSwapTotalTime += Date.now() - start;
          }
        }
        controller.enqueue(swapsRes);
      },
    });
  }
}

const median = (arr: ReferenceTokenWithPrice[]) => {
  if (arr.length === 1) return arr[0].priceTokenUsdc;
  const sorted = [...arr].sort((a, b) => a.priceTokenUsdc - b.priceTokenUsdc);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid].priceTokenUsdc
    : (sorted[mid - 1].priceTokenUsdc + sorted[mid].priceTokenUsdc) / 2;
};
