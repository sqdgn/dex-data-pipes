import { ClickHouseClient } from '@clickhouse/client';
import assert from 'node:assert';

type TokenHolders = {
  token: string;
  holders: number;
};

export class HolderCounter {
  private holdersByToken = new Map<string, number>();
  // Tokens for which the number of holders changed in the last iteration
  private updatedTokens = new Set<string>();

  constructor(private clickhouse: ClickHouseClient) {}

  private async *refetchHolders() {
    const result = await this.clickhouse.query({
      query: `
        SELECT
          token,
          argMax(holders, timestamp) AS holders
        FROM slp_holders
        GROUP BY token;
      `,
      format: 'JSONEachRow',
    });

    for await (const rows of result.stream<TokenHolders>()) {
      for (const row of rows) {
        yield row.json();
      }
    }
  }

  async loadFromDb() {
    for await (const { token, holders } of this.refetchHolders()) {
      this.holdersByToken.set(token, holders);
    }
  }

  public isTracked(token: string) {
    return this.holdersByToken.has(token);
  }

  public incHolders(token: string, by = 1) {
    const currentHolders = this.holdersByToken.get(token);
    // We only update holders count for tokens that exist in the map
    // because those are the tokens that were created at/after BLOCK_FROM
    if (currentHolders !== undefined) {
      this.holdersByToken.set(token, currentHolders + by);
      this.updatedTokens.add(token);
    }
  }

  public decHolders(token: string, by = 1) {
    const currentHolders = this.holdersByToken.get(token);
    if (currentHolders !== undefined) {
      if (by > currentHolders) {
        throw new Error(`Inconsistent state: number of holders cannot be negative (${token})`);
      }
      this.holdersByToken.set(token, currentHolders - by);
      this.updatedTokens.add(token);
    }
  }

  public startTracking(token: string) {
    this.holdersByToken.set(token, 0);
    this.updatedTokens.add(token);
  }

  public getUpdatesBatch() {
    const updates: TokenHolders[] = [];
    for (const token of this.updatedTokens) {
      const holders = this.holdersByToken.get(token);
      assert(holders !== undefined, `Inconsistent state! Missing holders for token ${token}`);
      updates.push({ token, holders });
    }
    this.updatedTokens.clear();
    return updates;
  }
}
