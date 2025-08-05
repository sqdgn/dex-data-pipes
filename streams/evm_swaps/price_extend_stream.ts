import assert from 'assert';
import _ from 'lodash';
import { createLogger } from '../../pipes/utils';
import { ClickHouseClient } from '@clickhouse/client';
import { EvmSwap, ExtendedEvmSwap } from './swap_types';
import { Network } from './networks';
import {
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

export class PriceExtendStream {
  private readonly refTokenPriceHistoryLen = 10;

  private refPricesTokenUsdc = new Map<string, ReferenceTokenWithPrice[]>();

  // Double map: account (wallet) -> token -> TokenPositions (FIFO queue)
  private accountPositions = new LRUMap<string, Map<string, TokenPositions>>(100_000);

  constructor(
    private client: ClickHouseClient,
    private network: Network,
    private logger: Logger,
  ) {
    assert(referenceTokens[network], `reference tokens must be defined for ${network}`);
  }

  private async preloadMissingAccountPositions(swaps: EvmSwap[]) {
    const filteredSwaps = swaps.filter(
      // For now we don't track positions for swaps where neither of the toknes are reference tokens
      (s) =>
        referenceTokens[this.network].findIndex(
          (refTok) =>
            refTok.tokenAddress === s.tokenA.address || refTok.tokenAddress === s.tokenB.address,
        ) !== -1,
    );
    const missingAccounts = _.uniq(filteredSwaps.map((s) => s.account)).filter(
      (a) => !this.accountPositions.has(a),
    );
    const foundAccounts = new Set<string>();
    // First we populate this.accountPositions with empty maps for
    // each of the missing accounts, because we still want to mark all of
    // them as "loaded into cache", even if they didn't make any swaps yet.
    // (so that they are not redundantly re-fetched later)
    for (const account of missingAccounts) {
      this.accountPositions.set(account, new Map());
    }
    const CHUNK_SIZE = 100;
    // if no chunks, https://github.com/ClickHouse/ClickHouse/issues/36783 will appear (query too huge)
    for (let i = 0; i < missingAccounts.length; i += CHUNK_SIZE) {
      const chunk = missingAccounts.slice(i, i + CHUNK_SIZE);
      // Now we populate the cache with the actual data
      let foundAccCount = 0;
      for await (const dbSwap of this.refetchPositions(chunk)) {
        foundAccounts.add(dbSwap.account);
        this.loadTokenPosition(dbSwap);
        foundAccCount++;
      }
      this.logger.debug(
        `Preloaded positions for ${chunk.length} missing accounts. ${foundAccCount} were found in db.`,
      );
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
      // Account positions not found in cache.
      // Try to reload from DB first...
      for await (const dbSwap of this.refetchPositions([account])) {
        this.loadTokenPosition(dbSwap);
      }
      // ...then use getOrCreate for this specific token
      const tokenPositions = this.getOrCreateTokenPositions(account, token);
      return tokenPositions;
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
    const toEndOfList = (x: number) => (x === -1 ? 1e9 : x);

    const index_a = toEndOfList(
      referenceTokens[this.network]!.findIndex((rt) => rt.tokenAddress === token_a),
    );
    const index_b = toEndOfList(
      referenceTokens[this.network]!.findIndex((rt) => rt.tokenAddress === token_b),
    );

    // if token_a is earlier in reference tokens list, then true is returned (need to swap it to become token_b)
    return index_a < index_b;
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
    // here token_b in the swap is possible reference token (sorted above)

    const refToTokenInfo = referenceTokens[this.network]?.find(
      (t) => t.tokenAddress === swap.tokenB.address,
    );

    if (
      !refToTokenInfo || // not a swap to reference token
      swap.tokenA.amount_raw === 0n || // or either amount is zero – cannot calculate price
      swap.tokenB.amount_raw === 0n ||
      swap.tokenA.amount_raw < 0n === swap.tokenB.amount_raw < 0n // both amounts of same sign - error but it happens
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

    const refFromTokenInfo = referenceTokens[this.network]?.find(
      (t) => t.tokenAddress === swap.tokenA.address,
    );

    if (refFromTokenInfo && swap.pool.address === refFromTokenInfo.poolAddress) {
      // token_a is also a reference token and swap in reference pool,
      // so price of token_a must be updated in local cache
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
      // inserted latest price is at the beginning
    }

    const positionsA = await chRetry(
      this.logger,
      async () => await this.getOrLoadTokenPositions(swap.account, swap.tokenA.address),
    );
    const positionsB = await chRetry(
      this.logger,
      async () => await this.getOrLoadTokenPositions(swap.account, swap.tokenB.address),
    );

    if (swap.tokenA.amount_human < 0) {
      // user withdraws A from a pool and deposits B to pool, so it means, is entry in A and exit on B
      positionsA.entry(-swap.tokenA.amount_human, swap.price_token_a_usdc);
      const exitB = positionsB.exit(swap.tokenB.amount_human, swap.price_token_b_usdc);
      swap.token_b_cost_usdc = exitB.entryCostUsdc;
      swap.token_b_profit_usdc = exitB.profitUsdc;
    } else {
      positionsB.entry(-swap.tokenB.amount_human, swap.price_token_b_usdc);
      const exitA = positionsA.exit(swap.tokenA.amount_human, swap.price_token_a_usdc);
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

  async pipe(): Promise<TransformStream<EvmSwap[], ExtendedEvmSwap[]>> {
    return new TransformStream({
      start: async () => {
        for (const refToken of referenceTokens[this.network]!) {
          const prices = await this.loadRefTokenPrices(refToken);
          this.refPricesTokenUsdc.set(refToken.tokenAddress, prices);
        }
      },
      transform: async (swaps: ExtendedEvmSwap[], controller) => {
        await this.preloadMissingAccountPositions(swaps);
        controller.enqueue(
          await Promise.all(
            swaps.map(async (s) => {
              try {
                return await this.processSwap(s);
              } catch (err) {
                this.logger.error(`processSwap: ${inspect(s)}`);
                throw err;
              }
            }),
          ),
        );
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
