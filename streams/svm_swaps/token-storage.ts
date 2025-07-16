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
  private db: DatabaseSync;
  private statements: Record<string, StatementSync>;
  private tokenByMintAcc: Map<string, SolanaToken>;
  private tokenByMetadataAcc: Map<string, SolanaToken>;

  private readonly insertKeys: (keyof SolanaToken)[] = [
    'mintAcc',
    'decimals',
    'metadataAcc',
    'name',
    'symbol',
    'mutable',
    'createdAt',
    'createdAtBlock',
    'creationTxHash',
  ];
  constructor(private readonly dbPath: string) {
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA synchronous = NORMAL');
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS "spl_tokens" (
        mintAcc TEXT NOT NULL,
        decimals INTEGER NOT NULL,
        metadataAcc TEXT UNIQUE,
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
            ${this.insertKeys.join(', ')}
        ) VALUES (
            ${this.insertKeys.map((k) => `:${k}`).join(', ')}
        )`
      ),
      setMetadata: this.db.prepare(
        `UPDATE "spl_tokens" SET
            metadataAcc=:metadataAcc,
            name=:name,
            symbol=:symbol,
            mutable=:mutable,
            name=:name,
            symbol=:symbol
        WHERE mintAcc=:mintAcc`
      ),
      updateName: this.db.prepare(
        `UPDATE "spl_tokens" SET name=:name WHERE metadataAcc=:metadataAcc`
      ),
      updateSymbol: this.db.prepare(`
        UPDATE "spl_tokens" SET symbol=:symbol WHERE metadataAcc=:metadataAcc
      `),
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
    // lodash.merge ignores `undefined`
    const updated = _.merge(current, updateData);
    this.tokenByMintAcc.set(updated.mintAcc, updated);
    this.tokenByMetadataAcc.set(updated.metadataAcc, updated);
  }

  processBatch(
    inserts: SolanaTokenMintData[],
    metadataAssigns: SolanaTokenMetadata[],
    metadataUpdates: SolanaTokenMetadataUpdate[]
  ) {
    const insertsByMint = new Map<string, SolanaToken>(
      inserts.map((t) => [t.mintAcc, t])
    );
    const enrichmentsByMint = new Map<string, SolanaTokenMetadata>(
      metadataAssigns.map((t) => [t.mintAcc, t])
    );
    const enrichmentsByMeta = new Map<string, SolanaTokenMetadata>(
      metadataAssigns.map((t) => [t.metadataAcc, t])
    );
    const updatesGrouped = Object.entries(
      _.groupBy(metadataUpdates, (t) => t.metadataAcc)
    );
    const updatesByMeta = new Map<string, SolanaTokenMetadataUpdate>(
      updatesGrouped.map(([metaAcc, updates]) => [metaAcc, _.merge(updates)])
    );

    for (const update of updatesByMeta.values()) {
      const enrichment = enrichmentsByMeta.get(update.metadataAcc);
      if (enrichment) {
        // Merge update into enrichment
        updatesByMeta.delete(update.metadataAcc);
        const merged = _.merge(enrichment, update);
        enrichmentsByMint.set(enrichment.mintAcc, merged);
        enrichmentsByMeta.set(enrichment.metadataAcc, merged);
      }
    }

    for (const enrichment of enrichmentsByMint.values()) {
      const token = insertsByMint.get(enrichment.mintAcc);
      if (token) {
        // Merge enrichment into insert
        enrichmentsByMint.delete(token.mintAcc);
        insertsByMint.set(token.mintAcc, _.merge(token, enrichment));
      }
    }

    this.db.exec(`BEGIN TRANSACTION`);
    this.insertTokens(Array.from(insertsByMint.values()));
    this.setTokensMetadata(Array.from(enrichmentsByMint.values()));
    this.updateTokensMetadata(Array.from(updatesByMeta.values()));
    this.db.exec(`COMMIT`);
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
      });
      this.updateTokenCache(meta);
    }
  }

  updateTokensMetadata(tokensMetadata: SolanaTokenMetadataUpdate[]) {
    for (const meta of tokensMetadata) {
      if (meta.name !== undefined) {
        this.statements.updateName.run({
          metadataAcc: meta.metadataAcc,
          name: meta.name,
        });
      }
      if (meta.symbol !== undefined) {
        this.statements.updateSymbol.run({
          metadataAcc: meta.metadataAcc,
          symbol: meta.symbol,
        });
      }
      if (meta.symbol !== undefined || meta.name !== undefined) {
        this.updateTokenCache(meta);
      }
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
