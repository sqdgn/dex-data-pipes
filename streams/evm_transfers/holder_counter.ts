import { Logger as PinoLogger } from 'pino';
import { Erc20Event } from './evm_transfers_stream';
import { DatabaseSync, StatementSync } from 'node:sqlite';
import { HolderCounterState } from './holder_counter_types';

export type Logger = PinoLogger;

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export type TokenHolders = {
  token: string;
  holderCount: number;
};

export type HoldersChangedCallback = (timestamp: number, holders: TokenHolders[]) => Promise<void>;

export type FirstMintCallback = (
  timestamp: string,
  token: string,
  transactionHash: string,
) => Promise<void>;

export class HolderCounter {
  private logger: Logger;
  private db: DatabaseSync;
  private statements: Record<string, StatementSync>;
  private firstMintsCount = 0;

  constructor(
    private dbPath: string,
    logger: Logger,
    private holdersChangedCallback: HoldersChangedCallback,
    private firstMintCallback?: FirstMintCallback,
  ) {
    this.logger = logger.child({
      module: 'HolderCounter',
    });
    this.initDb();
  }

  private initDb(): void {
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA synchronous = NORMAL');

    // Create tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS first_transfer_from (
        token TEXT PRIMARY KEY,
        firstFrom TEXT NOT NULL
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
    `);

    // Prepare statements
    this.statements = {
      getFirstFrom: this.db.prepare('SELECT firstFrom FROM first_transfer_from WHERE token = ?'),
      setFirstFrom: this.db.prepare(
        'INSERT OR IGNORE INTO first_transfer_from (token, firstFrom) VALUES (?, ?)',
      ),
      getBalance: this.db.prepare('SELECT balance FROM balances WHERE token = ? AND address = ?'),
      setBalance: this.db.prepare(
        'INSERT OR REPLACE INTO balances (token, address, balance) VALUES (?, ?, ?)',
      ),
      getHolderCount: this.db.prepare('SELECT holderCount FROM token_holder_count WHERE token = ?'),
      setHolderCount: this.db.prepare(
        'INSERT OR REPLACE INTO token_holder_count (token, holderCount) VALUES (?, ?)',
      ),
      getAllHolders: this.db.prepare('SELECT token, holderCount FROM token_holder_count'),
    };
  }

  private getFirstFrom(token: string): string | undefined {
    return (this.statements.getFirstFrom.get(token) as any)?.firstFrom;
  }

  private setFirstFrom(token: string, firstFrom: string): void {
    this.statements.setFirstFrom.run(token, firstFrom);
  }

  private getBalance(token: string, address: string): bigint {
    const row = this.statements.getBalance.get(token, address) as { balance: string } | undefined;
    return BigInt(row?.balance || '0');
  }

  private setBalance(token: string, address: string, balance: bigint): void {
    this.statements.setBalance.run(token, address, balance.toString());
  }

  private getHolderCount(token: string): number {
    const row = this.statements.getHolderCount.get(token) as { holderCount: number } | undefined;
    return row?.holderCount || 0;
  }

  private setHolderCount(token: string, count: number): void {
    this.statements.setHolderCount.run(token, count);
  }

  private getAllHolders(): TokenHolders[] {
    return this.statements.getAllHolders.all() as TokenHolders[];
  }

  private getState(): HolderCounterState {
    return this.db.prepare('SELECT * FROM state WHERE id=1').get() as HolderCounterState;
  }

  private updateStateProcessed(transfer: Erc20Event): void {
    this.db
      .prepare(
        'UPDATE state SET processedTimestamp = ?, processedTxIndex = ?, processedLogIndex = ? WHERE id = 1',
      )
      .run(transfer.timestamp.getTime(), transfer.transaction.index, transfer.transaction.logIndex);
  }

  private updateState(state: HolderCounterState): void {
    this.db
      .prepare(
        'UPDATE state SET processedTimestamp = ?, processedTxIndex = ?, processedLogIndex = ?, lastCallbackTimestamp = ?, lastCallbackTxIndex = ?, lastCallbackLogIndex = ? WHERE id = 1',
      )
      .run(
        state.processedTimestamp,
        state.processedTxIndex,
        state.processedLogIndex,
        state.lastCallbackTimestamp,
        state.lastCallbackTxIndex,
        state.lastCallbackLogIndex,
      );
  }

  private async emitCallbackIfNesessary(state: HolderCounterState, transfer: Erc20Event) {
    const toStartOf = this.toStartOfFiveMinutes;

    if (state.lastCallbackTimestamp === -1) {
      // first transfer ever -> insert dummy callback state as if in this 5 minutes interval callback was already called
      state.lastCallbackTimestamp = toStartOf(transfer.timestamp);
      this.updateState(state);
      return;
    }

    if (toStartOf(transfer.timestamp) === state.lastCallbackTimestamp) {
      // we are still in same time group, just exit for now
      return;
    }

    // we now entered the next time group, so emit callback for previous group,
    // NOT counting current transfer.
    const holders = this.getAllHolders();

    // Execute callback
    await this.holdersChangedCallback(toStartOf(new Date(state.processedTimestamp)), holders);

    // update callback state if callback is successful.
    // potential error (very rare case) – if pipe crashes between callback successfully wrote data somewhere else,
    // state is not updated. So when pipe is recovered, a duplicate will be sent in callback
    state.lastCallbackTimestamp = toStartOf(transfer.timestamp);
    this.updateState(state);
  }

  public async processTransfer(transfer: Erc20Event) {
    const state = this.getState();

    if (
      transfer.timestamp.getTime() < state.processedTimestamp ||
      (transfer.timestamp.getTime() === state.processedTimestamp &&
        transfer.transaction.index < state.processedTxIndex) ||
      (transfer.timestamp.getTime() === state.processedTimestamp &&
        transfer.transaction.index === state.processedTxIndex &&
        transfer.transaction.logIndex <= state.processedLogIndex)
    ) {
      // due to possible app outage counter can start from prev transfers that were processed –
      // so just ignore them until new one is passed.
      return;
    }

    await this.emitCallbackIfNesessary(state, transfer);

    const { from, to, token_address: token, amount, timestamp } = transfer;

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
        this.setFirstFrom(token, from);

        if (from === ZERO_ADDRESS && this.firstMintCallback) {
          // log first mint if from zero address
          await this.firstMintCallback(timestamp.toISOString(), token, transfer.transaction.hash);
          this.firstMintsCount++;
        }
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
      this.updateStateProcessed(transfer);
      this.db.prepare('COMMIT').run();
    } catch (err) {
      this.logger.error(err);
      this.db.prepare('ROLLBACK').run();
      throw err;
    }
  }

  printState() {
    const holders = this.getAllHolders();
    const totalHolders = holders.reduce((sum, h) => sum + h.holderCount, 0);
    const maxHolders = Math.max(...holders.map((h) => h.holderCount));
    const minHolders = Math.min(...holders.map((h) => h.holderCount));
    const avgHolders = holders.length > 0 ? Math.floor(totalHolders / holders.length) : 0;

    this.logger.info(
      [
        `tokenHolderCount: ${holders.length}`,
        `firstMintsCount: ${this.firstMintsCount}`,
        `maxTokenOwners: ${maxHolders}`,
        `minTokenOwners: ${minHolders}`,
        `avgTokenHolders: ${avgHolders}`,
      ].join(' '),
    );
  }

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
