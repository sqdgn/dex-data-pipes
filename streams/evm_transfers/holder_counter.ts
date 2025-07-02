import { Logger as PinoLogger } from 'pino';
import { Erc20Transfer } from './evm_transfers_stream';
import { DatabaseSync, StatementSync } from 'node:sqlite';
import { HolderCounterState } from './holder_counter_types';

export type Logger = PinoLogger;

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export type TokenHolders = {
  token: string;
  holderCount: number;
};

export type HoldersChangedHook = (timestamp: number, holders: TokenHolders[]) => Promise<void>;

export type FirstTransferHook = (transfer: Erc20Transfer) => Promise<void>;

export class HolderCounter {
  private logger: Logger;
  private db: DatabaseSync;
  private statements: Record<string, StatementSync>;
  private state: HolderCounterState;
  private metrics = {
    getFirstFrom: { total: 0, count: 0 },
    setFirstTransfer: { total: 0, count: 0 },
    getBalance: { total: 0, count: 0 },
    setBalance: { total: 0, count: 0 },
    getHolderCount: { total: 0, count: 0 },
    setHolderCount: { total: 0, count: 0 },
    getAllHolders: { total: 0, count: 0 },
    getState: { total: 0, count: 0 },
    updateStateProcessed: { total: 0, count: 0 },
    updateState: { total: 0, count: 0 },
    setLastTransferTimestamp: { total: 0, count: 0 },
  };
  private lastPrint = 0;
  private transferMetrics = {
    totalTransfers: 0,
    lastTransferCount: 0,
    lastTransferTime: Date.now(),
  };

  constructor(
    private dbPath: string,
    logger: Logger,
    private holdersChangedHook: HoldersChangedHook,
    private firstTransferHook: FirstTransferHook,
  ) {
    this.logger = logger.child({
      module: 'HolderCounter',
    });
    this.initDb();
    this.state = this.getState();
  }

  private initDb(): void {
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA synchronous = NORMAL');

    // Create tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS first_transfers (
        token TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        "from" TEXT NOT NULL,
        "to" TEXT NOT NULL,
        amount TEXT NOT NULL,
        block_number INTEGER NOT NULL,
        transaction_index INTEGER NOT NULL,
        log_index INTEGER NOT NULL,
        transaction_hash TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS last_token_transfer (
        token TEXT PRIMARY KEY,
        lastTransferTime INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS balances (
        token TEXT,
        address TEXT,
        balance TEXT NOT NULL, -- Using TEXT for BigInt storage
        PRIMARY KEY (token, address)
      );

      CREATE TABLE IF NOT EXISTS token_holder_count (
        token TEXT PRIMARY KEY,
        holderCount INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        processedTimestamp INTEGER,
        processedTxIndex INTEGER,
        processedLogIndex INTEGER,
        lastCallbackTimestamp INTEGER,
        lastCallbackTxIndex INTEGER,
        lastCallbackLogIndex INTEGER
      );

      -- Initialize state if empty
      INSERT OR IGNORE INTO state (id, processedTimestamp, processedTxIndex, processedLogIndex, lastCallbackTimestamp, lastCallbackTxIndex, lastCallbackLogIndex)
      VALUES (1, -1, -1, -1, -1, -1, -1);

      -- Create indexes for performance
      CREATE INDEX IF NOT EXISTS idx_balances_token ON balances(token);
      CREATE INDEX IF NOT EXISTS idx_balances_address ON balances(address);
      CREATE INDEX IF NOT EXISTS idx_last_token_transfer_ts ON last_token_transfer(lastTransferTime);
    `);

    // Prepare statements
    this.statements = {
      getFirstFrom: this.db.prepare('SELECT "from" FROM first_transfers WHERE token = ?'),
      getBalance: this.db.prepare('SELECT balance FROM balances WHERE token = ? AND address = ?'),
      setBalance: this.db.prepare(
        'INSERT OR REPLACE INTO balances (token, address, balance) VALUES (?, ?, ?)',
      ),
      getHolderCount: this.db.prepare('SELECT holderCount FROM token_holder_count WHERE token = ?'),
      setHolderCount: this.db.prepare(
        'INSERT OR REPLACE INTO token_holder_count (token, holderCount) VALUES (?, ?)',
      ),
    };
  }

  private measure<T>(name: keyof typeof this.metrics, fn: () => T): T {
    const start = performance.now();
    const result = fn();
    const time = performance.now() - start;
    this.metrics[name].total += time;
    this.metrics[name].count++;
    return result;
  }

  private getFirstFrom(token: string): string | undefined {
    return this.measure(
      'getFirstFrom',
      () =>
        (this.db.prepare('SELECT "from" FROM first_transfers WHERE token = ?').get(token) as any)
          ?.from,
    );
  }

  private setFirstTransfer(transfer: Erc20Transfer): void {
    this.measure('setFirstTransfer', () =>
      this.db
        .prepare(
          'INSERT OR IGNORE INTO first_transfers (token, timestamp, "from", "to", amount, block_number, transaction_index, log_index, transaction_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          transfer.token_address,
          transfer.timestamp.getTime(),
          transfer.from,
          transfer.to,
          transfer.amount.toString(),
          transfer.block.number,
          transfer.transaction.index,
          transfer.transaction.logIndex,
          transfer.transaction.hash,
        ),
    );
  }

  private getBalance(token: string, address: string): bigint {
    return this.measure('getBalance', () => {
      const row = this.statements.getBalance.get(token, address) as { balance: string } | undefined;
      return BigInt(row?.balance || '0');
    });
  }

  private setBalance(token: string, address: string, balance: bigint): void {
    this.measure('setBalance', () =>
      this.statements.setBalance.run(token, address, balance.toString()),
    );
  }

  private setLastTokenTransferTimestamp(token: string, timestamp: number): void {
    this.measure('setLastTransferTimestamp', () =>
      this.db
        .prepare(
          'INSERT OR REPLACE INTO last_token_transfer (token, lastTransferTime) VALUES (?, ?)',
        )
        .run(token, timestamp),
    );
  }

  private getHolderCount(token: string): number {
    return this.measure('getHolderCount', () => {
      const row = this.statements.getHolderCount.get(token) as { holderCount: number } | undefined;
      return row?.holderCount || 0;
    });
  }

  private setHolderCount(token: string, count: number): void {
    this.measure('setHolderCount', () => this.statements.setHolderCount.run(token, count));
  }

  private getAllHolders(startTime: number): TokenHolders[] {
    return this.measure(
      'getAllHolders',
      () =>
        this.db
          .prepare(`
            SELECT c.token AS token, c.holderCount AS holderCount
            FROM token_holder_count c
              JOIN last_token_transfer t ON t.token = c.token
            WHERE t.lastTransferTime >= ?
            `)
          .all(startTime) as TokenHolders[],
    );
  }

  private getState(): HolderCounterState {
    return this.measure(
      'getState',
      () => this.db.prepare('SELECT * FROM state WHERE id=1').get() as HolderCounterState,
    );
  }

  private updateStateProcessed(transfer: Erc20Transfer): void {
    this.measure('updateStateProcessed', () => {
      const res = this.db
        .prepare(
          'UPDATE state SET processedTimestamp = ?, processedTxIndex = ?, processedLogIndex = ? WHERE id = 1',
        )
        .run(
          transfer.timestamp.getTime(),
          transfer.transaction.index,
          transfer.transaction.logIndex,
        );

      this.state.processedTimestamp = transfer.timestamp.getTime();
      this.state.processedTxIndex = transfer.transaction.index;
      this.state.processedLogIndex = transfer.transaction.logIndex;
      return res;
    });
  }

  private flushState(): void {
    this.measure('updateState', () => {
      this.db
        .prepare(
          'UPDATE state SET processedTimestamp = ?, processedTxIndex = ?, processedLogIndex = ?, lastCallbackTimestamp = ?, lastCallbackTxIndex = ?, lastCallbackLogIndex = ? WHERE id = 1',
        )
        .run(
          this.state.processedTimestamp,
          this.state.processedTxIndex,
          this.state.processedLogIndex,
          this.state.lastCallbackTimestamp,
          this.state.lastCallbackTxIndex,
          this.state.lastCallbackLogIndex,
        );
    });
    this.printStats();
  }

  private printStats() {
    const now = Date.now();
    if (now - this.lastPrint > 60000) {
      // every minute
      let totalTimeSeconds = 0;
      console.log('\nDB Operations Stats:');
      Object.entries(this.metrics).forEach(([name, { total, count }]) => {
        if (count > 0) {
          const seconds = total / 1000;
          totalTimeSeconds += seconds;
          console.log(
            `${name}: ${(total / count).toFixed(2)}ms avg (${count} calls, ${seconds.toFixed(2)}s total)`,
          );
        }
      });
      console.log(`Total time spent in DB operations: ${totalTimeSeconds.toFixed(2)}s`);

      const transfersPerSecond =
        (this.transferMetrics.totalTransfers - this.transferMetrics.lastTransferCount) /
        ((now - this.transferMetrics.lastTransferTime) / 1000);
      console.log(
        `Transfers processed: ${this.transferMetrics.totalTransfers} (${transfersPerSecond.toFixed(2)}/sec)`,
      );

      this.transferMetrics.lastTransferCount = this.transferMetrics.totalTransfers;
      this.transferMetrics.lastTransferTime = now;
      this.lastPrint = now;
    }
  }

  private async emitCallbackIfNesessary(transfer: Erc20Transfer) {
    const toStartOf = this.toStartOfFiveMinutes;

    if (this.state.lastCallbackTimestamp === -1) {
      // first transfer ever -> insert dummy callback state as if in this 5 minutes interval callback was already called
      this.state.lastCallbackTimestamp = toStartOf(transfer.timestamp);
      this.flushState();
      return;
    }

    if (toStartOf(transfer.timestamp) === this.state.lastCallbackTimestamp) {
      // we are still in same time group, just exit for now
      return;
    }

    // we now entered the next time group, so emit callback for previous group,
    // NOT counting current transfer.
    // we extract only tokens where last transfer was in the current time group
    const currentGroupStart = toStartOf(new Date(this.state.processedTimestamp));
    const holders = this.getAllHolders(currentGroupStart);

    // Execute callback
    await this.holdersChangedHook(currentGroupStart, holders);

    // update callback state if callback is successful.
    // potential error (very rare case) – if pipe crashes between callback successfully wrote data somewhere else,
    // state is not updated. So when pipe is recovered, a duplicate will be sent in callback
    this.state.lastCallbackTimestamp = toStartOf(transfer.timestamp);
    this.flushState();
  }

  public async processTransfer(transfer: Erc20Transfer, onlyFirstTransfers: boolean) {
    this.transferMetrics.totalTransfers++;

    const { from, to, token_address: token, amount, timestamp } = transfer;

    if (
      timestamp.getTime() < this.state.processedTimestamp ||
      (timestamp.getTime() === this.state.processedTimestamp &&
        transfer.transaction.index < this.state.processedTxIndex) ||
      (timestamp.getTime() === this.state.processedTimestamp &&
        transfer.transaction.index === this.state.processedTxIndex &&
        transfer.transaction.logIndex <= this.state.processedLogIndex)
    ) {
      // due to possible app outage counter can start from prev transfers that were processed –
      // so just ignore them until new one is passed.
      return;
    }

    if (onlyFirstTransfers) {
      const firstFrom = this.getFirstFrom(token);
      if (firstFrom !== undefined) {
        return;
      }

      // trigger hook, update first transfer in DB and update processed state.
      // we trigger hooks first, since in case of failure after hook's trigger,
      // we will just call hook again (ClickHouse must handle duplicate items correctly)
      await this.firstTransferHook(transfer);

      this.db.prepare('BEGIN TRANSACTION').run();
      try {
        this.setFirstTransfer(transfer);
        this.updateStateProcessed(transfer);
        this.db.prepare('COMMIT').run();
      } catch (err) {
        this.logger.error(err);
        this.db.prepare('ROLLBACK').run();
        this.state = this.getState(); // reload state in case of error
        throw err;
      }
      return;
    }

    await this.emitCallbackIfNesessary(transfer);

    const firstFrom = this.getFirstFrom(token);
    // first transfer was from non-zero address.
    if (firstFrom !== undefined && firstFrom !== ZERO_ADDRESS) {
      // we skip calculate holders count for these tokens – can't reliably calculate holders for them –
      // – mint tx is somewhere before our dataset.
      this.updateStateProcessed(transfer);
      return;
    }

    this.db.prepare('BEGIN TRANSACTION').run();
    try {
      if (firstFrom === undefined) {
        // for this token no first from was recorded
        this.setFirstTransfer(transfer);
        await this.firstTransferHook(transfer);
      }

      let newHolderCount = this.getHolderCount(token);

      // Handle from balance
      if (from !== ZERO_ADDRESS) {
        const oldFromBal = this.getBalance(token, from);
        const newFromBal = oldFromBal - amount;

        if (newFromBal < 0n) {
          this.updateStateProcessed(transfer);
          this.db.prepare('COMMIT').run();
          return;
        }

        if (oldFromBal > 0n && newFromBal === 0n) {
          newHolderCount--;
        }
        this.setBalance(token, from, newFromBal);
      }

      // Handle to balance
      if (to !== ZERO_ADDRESS) {
        const oldToBal = this.getBalance(token, to);
        const newToBal = oldToBal + amount;

        if (oldToBal === 0n && newToBal > 0n) {
          newHolderCount++;
        }
        this.setBalance(token, to, newToBal);
        this.setHolderCount(token, newHolderCount);
      }
      this.setLastTokenTransferTimestamp(transfer.token_address, transfer.timestamp.getTime());
      this.updateStateProcessed(transfer);
      this.db.prepare('COMMIT').run();
    } catch (err) {
      this.logger.error(err);
      this.db.prepare('ROLLBACK').run();
      this.state = this.getState(); // reload state in case of error
      throw err;
    }
  }

  // printState() {
  //   const holders = this.getAllHolders();
  //   const totalHolders = holders.reduce((sum, h) => sum + h.holderCount, 0);
  //   const maxHolders = Math.max(...holders.map((h) => h.holderCount));
  //   const minHolders = Math.min(...holders.map((h) => h.holderCount));
  //   const avgHolders = holders.length > 0 ? Math.floor(totalHolders / holders.length) : 0;

  //   this.logger.info(
  //     [
  //       `tokenHolderCount: ${holders.length}`,
  //       `firstMintsCount: ${this.firstMintsCount}`,
  //       `maxTokenOwners: ${maxHolders}`,
  //       `minTokenOwners: ${minHolders}`,
  //       `avgTokenHolders: ${avgHolders}`,
  //     ].join(' '),
  //   );
  // }

  private toStartOfFiveMinutes(date: Date) {
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      date.getHours(),
      Math.floor(date.getMinutes() / 5) * 5,
      0,
      0,
    ).getTime();
  }
}
