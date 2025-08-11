import _ from 'lodash';
import { DatabaseSync, StatementSync } from 'node:sqlite';
import { TokenStorage } from './token-storage';
import { LaunchLabConfigStorage } from './launchlab-config-storage';

export class MetadataStorage {
  private db: DatabaseSync;
  public readonly tokens: TokenStorage;
  public readonly launchLabConfig: LaunchLabConfigStorage;
  private _lastProcessedBlock: number;
  private readonly queries = {
    setLastProcessedBlock: `INSERT INTO "sync_status" VALUES (:lastProcessedBlock, current_timestamp)`,
    getLastProcessedBlock: `SELECT max(last_processed_block) AS lastProcessedBlock FROM sync_status`,
  };
  private readonly statements: { [K in keyof MetadataStorage['queries']]: StatementSync };

  constructor(private readonly dbPath: string) {
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA synchronous = NORMAL');
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS "sync_status" (
        last_processed_block INTEGER NOT NULL PRIMARY KEY,
        timestamp TEXT
      )`,
    );
    this.statements = {
      setLastProcessedBlock: this.db.prepare(this.queries.setLastProcessedBlock),
      getLastProcessedBlock: this.db.prepare(this.queries.getLastProcessedBlock),
    };
    this._lastProcessedBlock =
      (this.statements.getLastProcessedBlock.get() as { lastProcessedBlock: number })
        ?.lastProcessedBlock || 0;
    this.tokens = new TokenStorage(this.db);
    this.launchLabConfig = new LaunchLabConfigStorage(this.db);
  }

  beginTransaction() {
    this.db.exec(`BEGIN TRANSACTION`);
  }

  commit(blockNumber: number) {
    if (blockNumber > this.lastProcessedBlock) {
      this.statements.setLastProcessedBlock.run({ lastProcessedBlock: blockNumber });
      this._lastProcessedBlock = blockNumber;
    }
    this.db.exec(`COMMIT`);
  }

  public get lastProcessedBlock() {
    return this._lastProcessedBlock;
  }
}
