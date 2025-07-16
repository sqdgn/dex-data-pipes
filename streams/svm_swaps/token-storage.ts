import { DatabaseSync, StatementSync } from 'node:sqlite';
import {
  SolanaToken,
  SolanaTokenMetadata,
  SolanaTokenMetadataUpdate,
  SolanaTokenMintData,
} from './types';
import _ from 'lodash';
import { TOKENS } from './utils';

export class TokenStorage {
  db: DatabaseSync;
  statements: Record<string, StatementSync>;
  tokenByMintAcc: Map<string, SolanaToken>;
  tokenByMetadataAcc: Map<string, SolanaToken>;

  constructor(private readonly dbPath: string) {
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS "spl_tokens" (
        mintAcc TEXT NOT NULL,
        decimals INTEGER NOT NULL,
        metadataAcc TEXT,
        name TEXT,
        symbol TEXT,
        mutable INTEGER,
        createdAt TEXT,
        createdAtBlock INTEGER,
        creationTxHash TEXT,
        PRIMARY KEY (mintAcc)
      )`
    );
    this.statements = {
      insert: this.db.prepare(
        `INSERT OR IGNORE INTO "spl_tokens" (
            mintAcc,
            decimals,
            createdAt,
            createdAtBlock,
            creationTxHash
        ) VALUES (
            :mintAcc,
            :decimals,
            :createdAt,
            :createdAtBlock,
            :creationTxHash
        )`
      ),
      setMetadata: this.db.prepare(
        `UPDATE "spl_tokens" SET
            metadataAcc=:metadataAcc,
            name=:name,
            symbol=:symbol,
            mutable=:isMutable
        WHERE mintAcc=:mintAcc`
      ),
      updateMetadata: this.db.prepare(
        `UPDATE "spl_tokens" SET
            name=COALESCE(:name, name),
            symbol=COALESCE(:symbol, symbol)
        WHERE metadataAcc=:metadataAcc`
      ),
    };
    this.tokenByMintAcc = new Map();
    this.tokenByMetadataAcc = new Map();
    this.addKnownTokensToCache();
  }

  addKnownTokensToCache() {
    this.tokenByMintAcc.set(TOKENS.SOL, {
      mintAcc: TOKENS.SOL,
      decimals: 9,
      symbol: 'SOL',
    });
    this.tokenByMintAcc.set(TOKENS.USDC, {
      mintAcc: TOKENS.USDC,
      decimals: 6,
      symbol: 'USDC',
    });
    this.tokenByMintAcc.set(TOKENS.USDT, {
      mintAcc: TOKENS.USDT,
      decimals: 6,
      symbol: 'USDT',
    });
    this.tokenByMintAcc.set(TOKENS.USDS, {
      mintAcc: TOKENS.USDS,
      decimals: 6,
      symbol: 'USDS',
    });
  }

  getToken(mintAcc: string): SolanaToken | undefined {
    let token = this.tokenByMintAcc.get(mintAcc);

    if (!token) {
      const md = this.getTokensFromDb([mintAcc]);
      token = md[mintAcc];

      if (token) {
        this.tokenByMintAcc.set(mintAcc, token);
      } else {
        return undefined;
      }
    }
    return token;
  }

  updateTokenCache(
    updateData: SolanaTokenMetadata | SolanaTokenMetadataUpdate
  ) {
    const current =
      'mintAcc' in updateData
        ? this.tokenByMintAcc.get(updateData.mintAcc)
        : this.tokenByMetadataAcc.get(updateData.metadataAcc);
    if (!current) {
      // If the token was not found in cache, we skip the update
      return;
    }
    // Ignore undefined | null values in updateData
    updateData = Object.fromEntries(
      Object.entries(updateData).filter(
        ([, value]) => value !== undefined && value !== null
      )
    ) as SolanaTokenMetadata | SolanaTokenMetadataUpdate;
    const updated = {
      ...current,
      ...updateData,
    };
    this.tokenByMintAcc.set(updated.mintAcc, updated);
    this.tokenByMetadataAcc.set(updated.metadataAcc, updated);
  }

  insertTokens(tokens: SolanaTokenMintData[]) {
    for (const token of tokens) {
      this.statements.insert.run(token);
      this.tokenByMintAcc.set(token.mintAcc, token);
    }
  }

  setTokensMetadata(tokensMetadata: SolanaTokenMetadata[]) {
    for (const meta of tokensMetadata) {
      this.statements.setMetadata.run({
        ...meta,
        isMutable: meta.isMutable ? 1 : 0,
      });
      this.updateTokenCache(meta);
    }
  }

  updateTokensMetadata(tokensMetadata: SolanaTokenMetadataUpdate[]) {
    for (const meta of tokensMetadata) {
      this.statements.updateMetadata.run({
        metadataAcc: meta.metadataAcc,
        name: meta.name || null,
        symbol: meta.symbol || null,
      });
      this.updateTokenCache(meta);
    }
  }

  getTokensFromDb(mintAccs: string[]): Record<string, SolanaToken> {
    if (!mintAccs.length) return {};

    const params = new Array(mintAccs.length).fill('?').join(',');
    const select = this.db.prepare(`
        SELECT *
        FROM "spl_tokens"
        WHERE "mintAcc" IN (${params})
    `);

    const tokens = select.all(...mintAccs) as SolanaToken[];

    return tokens.reduce(
      (res, token) => ({
        ...res,
        [token.mintAcc]: token || undefined,
      }),
      {}
    );
  }
}
