import { createClient } from '@clickhouse/client';
import type { NodeClickHouseClient } from '@clickhouse/client/dist/client';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ClickhouseService {
  client: NodeClickHouseClient;

  constructor() {
    this.client = createClient({
      url: 'http://localhost:8123',
      password: '',
      clickhouse_settings: {
        date_time_output_format: 'iso',
      },
    });
  }

  async getSwaps({
                   query,
                   limit = 100,
                 }: {
    query?: { dex?: string; token?: string };
    limit?: number;
  }) {
    const res = await this.client.query({
      query: `SELECT timestamp,
                     dex,
                     token_a,
                     token_b,
                     a_to_b,
                     amount_a,
                     amount_b,
                     transaction_hash,
                     account
              FROM "solana_swaps_raw"
              ORDER BY timestamp DESC
              LIMIT ${limit}`,
      query_params: query,
      format: 'JSONStringsEachRow',
    });

    return res.json<{
      timestamp: string;
      dex: string;
      token_a: string;
      token_b: string;
      a_to_b: boolean;
      amount_a: string;
      amount_b: string;
      account: string;
      transaction_hash: string;
    }>();
  }

  async getAllAccountTokens(account: string) {
    const res = await this.client.query({
      query: `SELECT token, sum(amount) as amount
              FROM "solana_portfolio"
              WHERE account = {account:String}
              GROUP BY account, token
              ORDER BY amount DESC`,
      query_params: {account},
      format: 'JSONStringsEachRow',
    });

    return res.json<{
      token: string;
      amount: string;
    }>();
  }
}
