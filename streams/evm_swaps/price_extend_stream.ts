import assert from 'assert';
import { ClickHouseClient } from '@clickhouse/client';
import { EvmSwap, ExtendedEvmSwap } from './swap_types';
import { Network } from './networks';
import { ZERO_ADDRESS } from './token_metadata_storage';

type ReferenceToken = {
  tokenAddress: string;
  poolAddress: string;
};

type ReferenceTokenWithPrice = ReferenceToken & {
  priceTokenUsdc: number;
  timestamp: number;
};

const USDC_TOKEN_ADDRESS: Record<Network, string> = {
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'.toLowerCase(),
  ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'.toLowerCase(),
};

const USDC_POOL_ADDRESS: Record<Network, string> = {
  base: '0xd0b53d9277642d899df5c87a3966a349a798f224'.toLowerCase(),
  ethereum: '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640'.toLowerCase(),
};

// order is important. The first token in the list, then it is more "referency".
// Example: in case of VIRTUAL-WETH, WETH is more fundamental, so it goes earlier.
const referenceTokens: Record<Network, ReferenceToken[]> = {
  base: [
    {
      tokenAddress: USDC_TOKEN_ADDRESS.base, // USDC
      poolAddress: USDC_POOL_ADDRESS.base,
    },
    {
      tokenAddress: ZERO_ADDRESS, // ETH
      poolAddress:
        '0x96d4b53a38337a5733179751781178a2613306063c511b78cd02684739288c0a'.toLowerCase(), // ETH-USDC Uniswap V4
    },
    {
      tokenAddress: '0x4200000000000000000000000000000000000006', // WETH
      poolAddress: USDC_POOL_ADDRESS.base,
    },
    {
      tokenAddress: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf'.toLowerCase(), // cbBTC
      poolAddress: '0x70acdf2ad0bf2402c957154f944c19ef4e1cbae1'.toLowerCase(),
    },
    {
      tokenAddress: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b'.toLowerCase(), // VIRTUAL
      poolAddress: '0xE31c372a7Af875b3B5E0F3713B17ef51556da667'.toLowerCase(),
    },
    {
      tokenAddress: '0x940181a94A35A4569E4529A3CDfB74e38FD98631'.toLowerCase(), // AERO
      poolAddress: '0x6cdcb1c4a4d1c3c6d054b27ac5b77e89eafb971d'.toLowerCase(),
    },
    {
      tokenAddress: '0x1111111111166b7FE7bd91427724B487980aFc69'.toLowerCase(), // ZORA
      poolAddress: '0xedc625b74537ee3a10874f53d170e9c17a906b9c'.toLowerCase(),
    },
    {
      tokenAddress: '0x20DD04c17AFD5c9a8b3f2cdacaa8Ee7907385BEF'.toLowerCase(), // NATIVE
      poolAddress: '0x4cd15f2bc9533bf6fac4ae33c649f138cb601935',
    },
  ],
  ethereum: [
    {
      tokenAddress: USDC_TOKEN_ADDRESS.ethereum,
      poolAddress: USDC_POOL_ADDRESS.ethereum,
    },
    {
      tokenAddress: ZERO_ADDRESS, // ETH - native token
      poolAddress: '0x21c67e77068de97969ba93d4aab21826d33ca12bb9f565d8496e8fda8a82ca27', // ETH-USDC Uniswap V4 pool
    },
    {
      tokenAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'.toLowerCase(), // WETH
      poolAddress: USDC_POOL_ADDRESS.base,
    },
  ],
};

export class PriceExtendStream {
  private readonly refTokenPriceHistoryLen = 10;

  constructor(
    private client: ClickHouseClient,
    private network: Network,
  ) {
    assert(referenceTokens[network], `reference tokens must be defined for ${network}`);
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

  needSwap(token_a: string, token_b: string) {
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

  async pipe(): Promise<TransformStream<EvmSwap[], ExtendedEvmSwap[]>> {
    const refPricesTokenUsdc = new Map<string, ReferenceTokenWithPrice[]>();

    return new TransformStream({
      start: async () => {
        for (const refToken of referenceTokens[this.network]!) {
          const prices = await this.loadRefTokenPrices(refToken);
          refPricesTokenUsdc.set(refToken.tokenAddress, prices);
        }
      },
      transform: (swaps: ExtendedEvmSwap[], controller) => {
        for (const swap of swaps) {
          if (this.needSwap(swap.tokenA.address, swap.tokenB.address)) {
            [swap.tokenA, swap.tokenB] = [swap.tokenB, swap.tokenA];
            swap.a_b_swapped = true;
          }
          // here token_b in the swap is possible reference token (sorted above)

          const refToTokenInfo = referenceTokens[this.network]?.find(
            (t) => t.tokenAddress === swap.tokenB.address,
          );
          if (!refToTokenInfo) {
            // not a swap to reference token, cannot calculate price
            swap.price_token_a_usdc = 0;
            swap.price_token_b_usdc = 0;
            continue;
          }

          if (swap.tokenB.address === USDC_TOKEN_ADDRESS[this.network]) {
            if (
              Math.abs(swap.tokenB.amount_human) < 0.1 ||
              Math.abs(swap.tokenB.amount_human) > 10000
            ) {
              // don't calculate for too small and too large USDC amounts
              swap.price_token_a_usdc = 0;
              swap.price_token_b_usdc = 0;
              continue;
            }

            // swap with usdc
            swap.price_token_b_usdc = 1;
          } else {
            const histPrices = refPricesTokenUsdc.get(swap.tokenB.address);
            assert.ok(histPrices, 'historical prices must be loaded, init error');

            if (histPrices.length < this.refTokenPriceHistoryLen) {
              // not enough prices ref token in usdc to calc token_a usd price.
              swap.price_token_a_usdc = 0;
              swap.price_token_b_usdc = 0;
              continue;
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
            const historicalPrices = refPricesTokenUsdc.get(swap.tokenA.address)!;
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
        }
        controller.enqueue(swaps);
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
