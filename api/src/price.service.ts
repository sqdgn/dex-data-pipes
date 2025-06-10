import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { toUnixTime } from '../../pipes/clickhouse';

const SOL_USD = '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d';
const USDT_USD = '0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b';
const USDC_USD = '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a';

const FEEDS = {
  [SOL_USD]: 'So11111111111111111111111111111111111111112',
  [USDT_USD]: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  [USDC_USD]: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
};

export type PriceSnapshot = Record<string, number>;

@Injectable()
export class PriceService {
  async getPriceSnapshot(ts: string | number): Promise<PriceSnapshot> {
    const time = toUnixTime(ts);
    for (let i = 0; i < 10; i++) {
      const res = await axios.get<{
        parsed: { id: string; price: { price: string; expo: number } }[];
      }>(
        `https://hermes.pyth.network/v2/updates/price/${time + 30 * i}?ids[]=${SOL_USD}&ids[]=${USDT_USD}&ids[]=${USDC_USD}`,
        {
          validateStatus: () => true,
        },
      );
      // The price might not be available at the given timestamp
      if (res.status === 404) continue;

      return res.data.parsed.reduce((acc, rate) => {
        return {
          ...acc,
          [FEEDS[`0x${rate.id}`]]: Number(rate.price.price) / 10 ** Math.abs(rate.price.expo),
        };
      }, {});
    }
  }

  getUsdPrice(snapshot: PriceSnapshot, token: string, amount: string) {
    if (!snapshot[token]) return undefined;

    return String(snapshot[token] * Number(amount));
  }
}
