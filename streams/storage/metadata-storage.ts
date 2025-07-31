import _ from 'lodash';
import { DatabaseSync } from 'node:sqlite';
import { TokenStorage } from './token-storage';
import { LaunchLabConfigStorage } from './launchlab-config-storage';

export class MetadataStorage {
  private db: DatabaseSync;
  public readonly tokens: TokenStorage;
  public readonly launchLabConfig: LaunchLabConfigStorage;

  constructor(private readonly dbPath: string) {
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA synchronous = NORMAL');
    this.tokens = new TokenStorage(this.db);
    this.launchLabConfig = new LaunchLabConfigStorage(this.db);
  }

  beginTransaction() {
    this.db.exec(`BEGIN TRANSACTION`);
  }

  commit() {
    this.db.exec(`COMMIT`);
  }
}
