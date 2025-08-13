import _ from 'lodash';
import { DatabaseSync, StatementSync } from 'node:sqlite';
import {
  SolanaToken,
  SolanaTokenMetadata,
  SolanaTokenMetadataUpdate,
  SolanaTokenMintData,
  TokenIssuanceChange,
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
    insert: `INSERT OR IGNORE INTO "spl_tokens" (
            ${TokenStorage.columns.join(', ')}
        ) VALUES (
            ${TokenStorage.columns.map((k) => `:${k}`).join(', ')}
        )`,
    setMetadata: `UPDATE "spl_tokens" SET
            metadataAcc=:metadataAcc,
            name=:name,
            symbol=:symbol,
            mutable=:mutable,
            name=:name,
            symbol=:symbol
        WHERE mintAcc=:mintAcc`,
    updateName: `UPDATE "spl_tokens" SET name=:name WHERE metadataAcc=:metadataAcc`,
    updateSymbol: `UPDATE "spl_tokens" SET symbol=:symbol WHERE metadataAcc=:metadataAcc`,
    updateIssuance: `UPDATE
          "spl_tokens" AS t
        SET
          issuance = COALESCE(t.issuance, 0) + (CAST(:issuanceChange AS NUMERIC) / power(10, t.decimals))
        WHERE mintAcc=:mintAcc AND issuanceTracked=1`,
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
      insert: db.prepare(this.queries.insert),
      setMetadata: db.prepare(this.queries.setMetadata),
      updateName: db.prepare(this.queries.updateName),
      updateSymbol: db.prepare(this.queries.updateSymbol),
      updateIssuance: db.prepare(this.queries.updateIssuance),
    };
    this.addKnownTokensToCache();
  }

  addKnownTokensToCache() {
    for (const [mintAcc, tokenData] of KNOWN_TOKENS.entries()) {
      this.tokenByMintAcc.set(mintAcc, tokenData);
    }
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

  updateTokenCache(updateData: SolanaTokenMetadata | SolanaTokenMetadataUpdate) {
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
    metadataUpdates: SolanaTokenMetadataUpdate[],
    issuanceChangesByMint: Map<string, bigint>,
    trackIssuance = true,
  ) {
    const insertsByMint = new Map<string, SolanaToken>(
      inserts.map((t) => [
        t.mintAcc,
        {
          ...t,
          issuanceTracked: trackIssuance ? 1 : 0,
        },
      ]),
    );
    const enrichmentsByMint = new Map<string, SolanaTokenMetadata>(
      metadataAssigns.map((t) => [t.mintAcc, t]),
    );
    const enrichmentsByMeta = new Map<string, SolanaTokenMetadata>(
      metadataAssigns.map((t) => [t.metadataAcc, t]),
    );
    const updatesGrouped = Object.entries(_.groupBy(metadataUpdates, (t) => t.metadataAcc));
    const updatesByMeta = new Map<string, SolanaTokenMetadataUpdate>(
      updatesGrouped.map(([metaAcc, updates]) => [metaAcc, _.merge(updates)]),
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

    this.insertTokens(Array.from(insertsByMint.values()));
    this.setTokensMetadata(Array.from(enrichmentsByMint.values()));
    this.updateTokensMetadata(Array.from(updatesByMeta.values()));
    this.updateTokensIssuance(
      Array.from(issuanceChangesByMint.entries()).map(([mintAcc, issuanceChange]) => ({
        mintAcc,
        issuanceChange,
      })),
    );
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

  updateTokensIssuance(issuanceChanges: TokenIssuanceChange[]) {
    for (const { mintAcc, issuanceChange } of issuanceChanges) {
      if (KNOWN_TOKENS.has(mintAcc)) {
        continue;
      }
      this.statements.updateIssuance.run({ mintAcc, issuanceChange: issuanceChange.toString() });
      const cached = this.tokenByMintAcc.get(mintAcc);
      if (cached) {
        cached.issuance = (cached.issuance || new Decimal(0)).add(
          new Decimal(issuanceChange).div(Math.pow(10, cached.decimals)),
        );
      }
    }
  }

  getTokensFromDb(mintAccs: string[]): Record<string, SolanaToken> {
    if (!mintAccs.length) return {};

    const params = new Array(mintAccs.length).fill('?').join(',');
    const selectColumns = TokenStorage.columns.map((c) =>
      c === 'issuance' ? `CAST(${c} AS TEXT) AS ${c}` : c,
    );
    const select = this.db.prepare(`
        SELECT
          ${selectColumns.join(',')}
        FROM "spl_tokens"
        WHERE "mintAcc" IN (${params})
    `);

    const tokens = select.all(...mintAccs) as SolanaToken[];

    for (const token of tokens) {
      if (token.issuance) {
        token.issuance = new Decimal(token.issuance);
      }
    }

    return tokens.reduce(
      (res, token) => ({
        ...res,
        [token.mintAcc]: token || undefined,
      }),
      {},
    );
  }
}
