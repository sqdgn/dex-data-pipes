import { Logger } from 'pino';
import { MulticallAddresses, Network } from './networks';
import { ethers, JsonRpcProvider } from 'ethers';
import dotenv from 'dotenv';
import { DatabaseSync, StatementSync } from 'node:sqlite';
import * as assert from 'assert';

import { EvmSwap } from './swap_types';
import { nullToUndefined } from './util';
import { inspect } from 'util';

dotenv.config();

const TOKEN_BATCH_LEN = 100;
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export const ERC20_ABI = [
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
];

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
  tokenMetadataLoadErrorCount = new Map<string, number>(); // how many errors during token metadata loading

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
    // predefined base token (used in Uniswap V4)
    switch (network) {
      case 'base':
      case 'ethereum':
      case 'zora':
        this.tokenMetadataMap.set(ZERO_ADDRESS, {
          address: ZERO_ADDRESS,
          decimals: 18,
          network,
          symbol: 'ETH',
        });
        break;
      case 'bsc':
        this.tokenMetadataMap.set(ZERO_ADDRESS, {
          address: ZERO_ADDRESS,
          decimals: 18,
          network,
          symbol: 'BNB'
        })
        break;
    }
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

      let multicallResults: string[] = [];

      let dataSuccess = false;
      let callSuccess = false;
      for (let retries = 1; retries <= 3 && !dataSuccess; retries++) {
        try {
          multicallResults = await this.executeMulticall(calls);
          callSuccess = true;
        } catch (err) {
          this.logger.error(
            `multicall call error: ${(err as any).shortMessage || (err as any).reason}`,
          );
          continue;
        }
        if (multicallResults.includes('0x')) {
          this.logger.warn(`multicall call returned empty data, retry attempt ${retries}...`);
          continue;
        }
        dataSuccess = true;
      }
      const wrongDataTokenAddresses: string[] = [];

      if (callSuccess) {
        if (!dataSuccess) {
          const retryTokens = multicallResults
            .map((res, ind) => ({ ind, token: currentTokenBatch[ind / 2], res }))
            .filter((item) => item.ind % 2 === 0 && item.res === '0x')
            .map((item) => item.token);
          this.logger.warn(
            `still empty results in multicall call. Will retry via RPC for tokens: ${retryTokens.join(', ')}`,
          );
        }

        for (let i = 0; i < currentTokenBatch.length; i++) {
          const tokenAddress = currentTokenBatch[i];
          const decimalsIndex = i * 2;
          const symbolIndex = i * 2 + 1;

          try {
            const decimalsResult = multicallResults[decimalsIndex];
            const symbolResult = multicallResults[symbolIndex];

            if (decimalsResult === '0x' && symbolResult === '0x') {
              this.logger.warn(
                `decimals/symbol for ${tokenAddress} is empty, will try later via RPC`,
              );
              wrongDataTokenAddresses.push(tokenAddress);
              continue;
            }

            const decimals =
              decimalsResult && decimalsResult !== '0x'
                ? parseInt(decimalsResult.slice(-2), 16)
                : 18;
            const symbol = symbolResult ? this.parseStringFromHex(symbolResult) : '';

            const newToken = {
              address: tokenAddress,
              network: this.network,
              decimals,
              symbol,
            };
            this.saveTokenMetadataIntoDb([newToken]);
          } catch (err) {
            this.logger.warn('multicall decode error, will retry: ', inspect(err));
            wrongDataTokenAddresses.push(tokenAddress);
          }
        }
      } else {
        wrongDataTokenAddresses.push(...currentTokenBatch.map((t) => t));
      }

      if (wrongDataTokenAddresses.length) {
        this.logger.warn(
          `loading decimals/symbol one by one for: ${wrongDataTokenAddresses.join(' ')}`,
        );
        const tokensData = await this.getTokensMetadataRpc(wrongDataTokenAddresses);
        this.logger.warn(
          `one by one load completed, ${tokensData.filter((td) => td === undefined).length}/${tokensData.length} not loaded`,
        );
        tokensData.forEach((td, index) => {
          if (td) {
            this.saveTokenMetadataIntoDb([td]);
          } else {
            const tokenAddress = wrongDataTokenAddresses[index];
            const prevErrors = this.tokenMetadataLoadErrorCount.get(tokenAddress) ?? 0;
            if (prevErrors > 10) {
              // errors threshold exceeded – save as incomplete data token
              this.saveTokenMetadataIntoDb([
                {
                  address: tokenAddress,
                  decimals: 18,
                  network: this.network,
                  symbol: '',
                },
              ]);
            } else {
              this.tokenMetadataLoadErrorCount.set(tokenAddress, prevErrors + 1);
            }
          }
        });
      }
    }

    // Enrich events with token metadata
    events.forEach((event) => {
      if (event.tokenA.decimals === undefined) {
        const tokenData = this.getTokenMetadata(event.tokenA.address);
        event.tokenA.decimals = tokenData ? tokenData.decimals : Number.NaN;
        event.tokenA.symbol = tokenData ? tokenData.symbol : '';
      }

      if (event.tokenB.decimals === undefined) {
        const tokenData = this.getTokenMetadata(event.tokenB.address);
        event.tokenB.decimals = tokenData ? tokenData.decimals : Number.NaN;
        event.tokenB.symbol = tokenData ? tokenData.symbol : '';
      }
    });

    const nanEvents = events.filter(
      (e) =>
        Number.isNaN(e.tokenA.decimals) ||
        e.tokenA.decimals === undefined ||
        e.tokenA.decimals === null ||
        Number.isNaN(e.tokenB.decimals) ||
        e.tokenB.decimals === undefined ||
        e.tokenB.decimals === null,
    );
    if (nanEvents.length) {
      this.logger.warn(
        `enrichWithTokenData error: could not load decimals for ${nanEvents.length}. Most likely the app will crash later`,
      );
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

  private async getTokensMetadataRpc(
    tokenAddresses: string[],
  ): Promise<(TokenMetadata | undefined)[]> {
    const res = tokenAddresses.map(async (token) => {
      try {
        const tokenContract = new ethers.Contract(token, ERC20_ABI, this.provider);

        const [decimalsPromise, symbolPromise] = await Promise.allSettled([
          tokenContract.decimals(),
          tokenContract.symbol(),
        ]);

        const isMissingField = (rej: PromiseRejectedResult) =>
          rej.reason.code === 'BAD_DATA' ||
          (rej.reason.code === 'CALL_EXCEPTION' &&
            rej.reason.shortMessage === 'missing revert data');

        if (
          decimalsPromise.status === 'rejected' &&
          !isMissingField(decimalsPromise) &&
          symbolPromise.status === 'rejected' &&
          !isMissingField(symbolPromise)
        ) {
          // in case of two failures indicate some error (probably network), so return undefined for
          // future retries.
          this.logger.error(
            `getTokensMetadataRpc token ${token} unknown error: decimals: ${inspect(decimalsPromise.reason)}, symbol: ${inspect(symbolPromise.reason)}`,
          );
          return undefined;
        }
        return {
          address: token,
          decimals: decimalsPromise.status === 'fulfilled' ? parseInt(decimalsPromise.value) : 18,
          symbol: symbolPromise.status === 'fulfilled' ? symbolPromise.value : '',
          network: this.network,
        } satisfies TokenMetadata;
      } catch (err) {
        this.logger.error(`getTokensMetadataRpc unknown error: ${inspect(err)}`);
        return undefined;
      }
    });

    return Promise.all(res);
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
