import _ from 'lodash';
import { DatabaseSync, StatementSync } from 'node:sqlite';
import { LaunchLabConfig } from '../svm_swaps/types';

export class LaunchLabConfigStorage {
  private statements: Record<string, StatementSync>;
  private configByAcc: Map<string, LaunchLabConfig> = new Map();
  private loaded = false;
  private table = 'launchlab_config';

  constructor(private readonly db: DatabaseSync) {
    db.exec(
      `CREATE TABLE IF NOT EXISTS "${this.table}" (
        account TEXT NOT NULL,
        curveType INTEGER NOT NULL,
        PRIMARY KEY (account)
      )`,
    );
    this.statements = {
      insert: db.prepare(
        `INSERT OR IGNORE INTO "${this.table}"
        (account, curveType)
        VALUES
        (:account, :curveType)`,
      ),
    };
  }

  getConfig(account: string): LaunchLabConfig {
    if (!this.loaded) {
      this.load();
    }
    const config = this.configByAcc.get(account);
    if (!config) {
      throw new Error(`Raydium LaunchLab config not found by address: ${account}!`);
    }
    return config;
  }

  insertConfig(config: LaunchLabConfig) {
    this.statements.insert.run(config);
    this.configByAcc.set(config.account, config);
  }

  load(): void {
    const select = this.db.prepare(`SELECT * FROM "${this.table}"`);
    const configs = select.all() as LaunchLabConfig[];
    for (const config of configs) {
      this.configByAcc.set(config.account, config);
    }
    this.loaded = true;
  }
}
