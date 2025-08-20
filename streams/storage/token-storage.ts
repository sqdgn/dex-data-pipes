import _ from 'lodash';
import { DatabaseSync, StatementSync } from 'node:sqlite';
import {
  SolanaToken,
  SolanaTokenMetadata,
  SolanaTokenMetadataUpdate,
  SolanaTokenMintData,
} from '../svm_swaps/types';
import { TOKENS } from '../svm_swaps/utils';
import Decimal from 'decimal.js';

const KNOWN_TOKENS = new Map([
  [TOKENS.SOL, { mintAcc: TOKENS.SOL, decimals: 9, symbol: 'SOL', issuanceTracked: 0 }],
  [TOKENS.USDC, { mintAcc: TOKENS.USDC, decimals: 6, symbol: 'USDC', issuanceTracked: 0 }],
  [TOKENS.USDT, { mintAcc: TOKENS.USDT, decimals: 6, symbol: 'USDT', issuanceTracked: 0 }],
  [TOKENS.USDS, { mintAcc: TOKENS.USDS, decimals: 6, symbol: 'USDS', issuanceTracked: 0 }],
]);

export class TokenStorage {
  // Set of mint accounts
  private pendingUpdateTokens = new Set<string>();

  private static columns: (keyof SolanaToken)[] = [
    'mintAcc',
    'decimals',
    'issuanceTracked',
    'issuance',
    'metadataAcc',
    'name',
    'symbol',
    'mutable',
    'createdAt',
    'createdAtBlock',
    'creationTxHash',
  ];
  private readonly queries = {
    upsert: `INSERT INTO "spl_tokens" (
            ${TokenStorage.columns.join(', ')}
        ) VALUES (
            ${TokenStorage.columns.map((k) => `:${k}`).join(', ')}
        )
        ON CONFLICT(mintAcc) DO UPDATE SET
            ${TokenStorage.columns
              .filter((c) => c !== 'mintAcc')
              .map((c) => `${c}=excluded.${c}`)
              .join(', ')}`,
  };
  private readonly statements: { [K in keyof TokenStorage['queries']]: StatementSync };
  private tokenByMintAcc: Map<string, SolanaToken> = new Map();
  private tokenByMetadataAcc: Map<string, SolanaToken> = new Map();

  constructor(private readonly db: DatabaseSync) {
    db.exec(
      `CREATE TABLE IF NOT EXISTS "spl_tokens" (
        mintAcc TEXT NOT NULL,
        decimals INTEGER NOT NULL,
        issuance NUMERIC,
        issuanceTracked INTEGER,
        metadataAcc TEXT UNIQUE,
        name TEXT,
        symbol TEXT,
        mutable INTEGER,
        createdAt TEXT,
        createdAtBlock INTEGER,
        creationTxHash TEXT,
        PRIMARY KEY (mintAcc)
      )`,
    );
    this.statements = {
      upsert: db.prepare(this.queries.upsert),
    };
    this.addKnownTokensToCache();
  }

  addKnownTokensToCache() {
    for (const [mintAcc, tokenData] of KNOWN_TOKENS.entries()) {
      this.tokenByMintAcc.set(mintAcc, tokenData);
    }
  }

  getTokenFromCache(account: string, accountType: 'mintAcc' | 'metadataAcc' = 'mintAcc') {
    return accountType === 'mintAcc'
      ? this.tokenByMintAcc.get(account)
      : this.tokenByMetadataAcc.get(account);
  }

  getTokenFromCacheOrFail(account: string, accountType: 'mintAcc' | 'metadataAcc' = 'mintAcc') {
    const token = this.getTokenFromCache(account, accountType);
    if (!token) {
      throw new Error(
        `Token by ${accountType}: ${account} expected to be in cache, but is missing!`,
      );
    }
    return token;
  }

  getToken(
    account: string,
    accountType: 'mintAcc' | 'metadataAcc' = 'mintAcc',
  ): SolanaToken | undefined {
    const token = this.getTokenFromCache(account, accountType);

    if (token) {
      return token;
    }

    // Cache miss: Load from db
    this.loadTokensFromDb([account], accountType);

    return this.getTokenFromCache(account, accountType);
  }

  getTokenOrFail(account: string, accountType: 'mintAcc' | 'metadataAcc' = 'mintAcc'): SolanaToken {
    const token = this.getToken(account, accountType);
    if (!token) {
      throw new Error(`Cannot find token by ${accountType}: ${account}!`);
    }
    return token;
  }

  loadToCache(token: SolanaToken) {
    this.tokenByMintAcc.set(token.mintAcc, token);
    if (token.metadataAcc) {
      this.tokenByMetadataAcc.set(token.metadataAcc, token);
    }
  }

  handleNew(mintData: SolanaTokenMintData, trackIssuance = true) {
    this.loadToCache({
      ...mintData,
      issuanceTracked: trackIssuance ? 1 : 0,
    });
    this.pendingUpdateTokens.add(mintData.mintAcc);
  }

  handleSetMetadata(metadata: SolanaTokenMetadata) {
    const token = this.getToken(metadata.mintAcc, 'mintAcc');
    if (token) {
      // If token is tracked...
      _.merge(token, metadata);
      this.pendingUpdateTokens.add(token.mintAcc);
    }
  }

  handleUpdateMetadata(metadataUpdate: SolanaTokenMetadataUpdate) {
    const token = this.getToken(metadataUpdate.metadataAcc, 'metadataAcc');
    if (token) {
      // If token is tracked...
      _.merge(token, metadataUpdate);
      this.pendingUpdateTokens.add(token.mintAcc);
    }
  }

  handleUpdateTokensIssuance(mintAcc: string, change: bigint) {
    const token = this.getToken(mintAcc, 'mintAcc');
    if (token && token.issuanceTracked) {
      // If token & token issuance is tracked...
      token.issuance = (token.issuance || new Decimal(0)).add(
        new Decimal(change).div(Math.pow(10, token.decimals)),
      );
      this.pendingUpdateTokens.add(token.mintAcc);
    }
  }

  persistChanges() {
    for (const mintAcc of this.pendingUpdateTokens) {
      const token = this.getTokenFromCacheOrFail(mintAcc);
      this.statements.upsert.run({
        ...token,
        issuance: token.issuance?.toString() || null,
      });
    }
  }

  loadTokensFromDb(accounts: string[], accountType: 'mintAcc' | 'metadataAcc' = 'mintAcc'): void {
    if (!accounts.length) return;

    const params = new Array(accounts.length).fill('?').join(',');
    const selectColumns = TokenStorage.columns.map((c) =>
      c === 'issuance' ? `CAST(${c} AS TEXT) AS ${c}` : c,
    );
    const select = this.db.prepare(`
        SELECT
          ${selectColumns.join(',')}
        FROM "spl_tokens"
        WHERE "${accountType}" IN (${params})
    `);

    const tokens = select.all(...accounts) as SolanaToken[];

    for (const token of tokens) {
      if (token.issuance) {
        token.issuance = new Decimal(token.issuance);
      }
      this.loadToCache(token);
    }
  }
}
