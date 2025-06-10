import { Logger } from 'pino';
import { MulticallAddresses, Network } from './networks';
import { ethers, JsonRpcProvider } from 'ethers';
import dotenv from 'dotenv';
import { DatabaseSync, StatementSync } from 'node:sqlite';
import * as assert from 'assert';

import { EvmSwap } from './swap_types';
import { nullToUndefined } from './util';

dotenv.config();

const TOKEN_BATCH_LEN = 100;
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export type TokenMetadata = {
  network: Network;
  address: string;
  decimals: number;
  symbol: string;
};

export class TokenMetadataStorage {
  provider: JsonRpcProvider;
  db: DatabaseSync;
  statements: Record<string, StatementSync>;
  tokenMetadataMap: Map<string, TokenMetadata>;

  constructor(
    private readonly dbPath: string,
    private readonly logger: Logger,
    private readonly network: Network,
  ) {
    const key = `${network.toUpperCase()}_RPC_URL`;
    const rpcUrl = process.env[key];
    assert.ok(rpcUrl, `${key} is not specified`);
    this.provider = new ethers.JsonRpcProvider(rpcUrl);

    this.db = new DatabaseSync(this.dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS "evm_tokens" (network TEXT, address TEXT, decimals INTEGER, symbol TEXT, PRIMARY KEY (network, address))',
    );
    this.statements = {
      insert: this.db.prepare(
        'INSERT OR IGNORE INTO "evm_tokens" VALUES (:network, :address, :decimals, :symbol)',
      ),
    };
    this.tokenMetadataMap = new Map();
    // predefined ETH token (used in Uniswap V4)
    this.tokenMetadataMap.set(ZERO_ADDRESS, {
      address: ZERO_ADDRESS,
      decimals: 18,
      network,
      symbol: 'ETH',
    });
  }

  getTokenMetadata(tokenAddress: string): TokenMetadata | undefined {
    let tokenMetadata = this.tokenMetadataMap.get(tokenAddress);

    if (!tokenMetadata) {
      const md = this.getTokenMetadataFromDb([tokenAddress]);
      tokenMetadata = md[tokenAddress];

      if (tokenMetadata) {
        this.tokenMetadataMap.set(tokenAddress, tokenMetadata);
      } else {
        return undefined;
      }
    }
    return tokenMetadata;
  }

  saveTokenMetadataIntoDb(tokenMetadata: TokenMetadata[]) {
    for (const token of tokenMetadata) {
      this.statements.insert.run(token);
    }
  }

  getTokenMetadataFromDb(tokenAddresses: string[]): Record<string, TokenMetadata> {
    if (!tokenAddresses.length) return {};

    const params = new Array(tokenAddresses.length).fill('?').join(',');
    const select = this.db.prepare(`
        SELECT *
        FROM "evm_tokens"
        WHERE "network" = ? AND "address" IN (${params})
    `);

    const tokensMetadata = select.all(this.network, ...tokenAddresses) as TokenMetadata[];

    return tokensMetadata.reduce(
      (res, token) => ({
        ...res,
        [token.address]: nullToUndefined(token),
      }),
      {},
    );
  }

  async enrichWithTokenData(events: EvmSwap[]) {
    const tokenAddresses = new Set<string>();
    events.forEach((event) => {
      if (event.tokenA.decimals === undefined) {
        tokenAddresses.add(event.tokenA.address);
      }
      if (event.tokenB.decimals === undefined) {
        tokenAddresses.add(event.tokenB.address);
      }
    });

    let uniqueTokens = Array.from(tokenAddresses);

    try {
      while (uniqueTokens.length) {
        // break them to batches TOKEN_BATCH_LEN each
        const endIndex = Math.min(uniqueTokens.length, TOKEN_BATCH_LEN);
        const currentTokenBatch = uniqueTokens.slice(0, endIndex);
        uniqueTokens = uniqueTokens.slice(endIndex, uniqueTokens.length);

        const calls = currentTokenBatch.flatMap((tokenAddress) => [
          {
            target: tokenAddress,
            // decimals() function selector: 0x313ce567
            callData: '0x313ce567',
          },
          {
            target: tokenAddress,
            // symbol() function selector: 0x95d89b41
            callData: '0x95d89b41',
          },
        ]);

        const results = await this.executeMulticall(calls);
        const newLoadedTokens: TokenMetadata[] = [];

        for (let i = 0; i < currentTokenBatch.length; i++) {
          const tokenAddress = currentTokenBatch[i];
          const decimalsIndex = i * 2;
          const symbolIndex = i * 2 + 1;

          try {
            // Parse decimals (uint8)
            const decimalsResult = results[decimalsIndex];
            const decimals = decimalsResult ? parseInt(decimalsResult.slice(-2), 16) : 18;

            // Parse symbol (string)
            const symbolResult = results[symbolIndex];
            const symbol = symbolResult ? this.parseStringFromHex(symbolResult) : '';

            const newToken = {
              address: tokenAddress,
              network: this.network,
              decimals,
              symbol,
            };
            newLoadedTokens.push(newToken);
            this.tokenMetadataMap.set(tokenAddress, newToken);
          } catch (decodeError) {
            this.tokenMetadataMap.set(tokenAddress, {
              address: tokenAddress,
              network: this.network,
              decimals: 18,
              symbol: '',
            });
          }
        }
        this.saveTokenMetadataIntoDb(newLoadedTokens);
      }

      // Enrich events with token metadata
      events.forEach((event) => {
        if (event.tokenA.decimals === undefined) {
          const tokenAData = this.tokenMetadataMap.get(event.tokenA.address);
          assert.ok(tokenAData);
          event.tokenA.decimals = tokenAData.decimals;
          event.tokenA.symbol = tokenAData.symbol;
        }

        if (event.tokenB.decimals === undefined) {
          const tokenBData = this.tokenMetadataMap.get(event.tokenB.address);
          assert.ok(tokenBData);
          event.tokenB.decimals = tokenBData.decimals;
          event.tokenB.symbol = tokenBData.symbol;
        }
      });
    } catch (error) {
      this.logger.error('Failed to enrich token data with multicall:', error);
    }
  }

  private async executeMulticall(
    calls: Array<{ target: string; callData: string }>,
  ): Promise<string[]> {
    const multicallAddress = MulticallAddresses[this.network];
    if (!multicallAddress) {
      throw new Error(`Multicall contract not configured for network: ${this.network}`);
    }

    const multicallAbi = [
      'function aggregate(tuple(address target, bytes callData)[] calls) view returns (uint256 blockNumber, bytes[] returnData)',
    ];

    const multicallContract = new ethers.Contract(multicallAddress, multicallAbi, this.provider);
    const [, returnData] = await multicallContract.aggregate(calls);
    return returnData.map((data: any) => ethers.hexlify(data));
  }

  private parseStringFromHex(hex: string): string {
    try {
      // Remove 0x prefix and parse string from hex
      const cleanHex = hex.replace('0x', '');
      // Skip the first 64 characters (length encoding) and convert to string
      const stringData = cleanHex.slice(128);
      let result = '';
      for (let i = 0; i < stringData.length; i += 2) {
        const charCode = parseInt(stringData.substr(i, 2), 16);
        if (charCode === 0) break;
        result += String.fromCharCode(charCode);
      }
      return result || '';
    } catch {
      return '';
    }
  }
}
