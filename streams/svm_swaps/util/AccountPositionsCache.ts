import assert from 'node:assert';
import { LRUMap } from './LRUMap';
import { TokenPositions } from './TokenPositions';
import fs from 'fs';
import readline from 'node:readline';
import { createLogger } from '../../../pipes/utils';
import { timeIt } from '../utils';
import _ from 'lodash';

// We limit LRU cache for account positions to 100_000
// most recently used accounts.
const ACCOUNT_POSITIONS_MAP_CAPACITY = 100_000;
// cache dump interval
const SOLANA_BLOCKTIME_SEC = 0.4;
const DEFAULT_CACHE_DUMP_INTERVAL_BLOCKS = (30 * 60) / SOLANA_BLOCKTIME_SEC; // dump every ~30m of indexed data

function indent(size: number) {
  return _.repeat('  ', size);
}
export class AccountsPositionsCache {
  private readonly __version = '1.0.0';
  private _loaded = false;
  private _lastDumpBlock = 0;
  // Double map: userAcc -> tokenMintAcc -> TokenPositions (FIFO queue)
  private accountPositions = new LRUMap<string, Map<string, TokenPositions>>(
    ACCOUNT_POSITIONS_MAP_CAPACITY,
  );
  private logger = createLogger('accounts positions cache');

  constructor(private dumpIntervalBlocks = DEFAULT_CACHE_DUMP_INTERVAL_BLOCKS) {}

  public has(account: string) {
    return this.accountPositions.has(account);
  }

  public set(account: string, positionsPerToken: Map<string, TokenPositions>) {
    this.accountPositions.set(account, positionsPerToken);
  }

  public get(account: string) {
    return this.accountPositions.get(account);
  }

  public keys() {
    return this.accountPositions.keys();
  }

  public get size() {
    return this.accountPositions.size;
  }

  public get lastDumpBlock(): number {
    return this._lastDumpBlock;
  }

  public get loaded(): boolean {
    return this._loaded;
  }

  public getOrCreateTokenPositions(account: string, token: string): TokenPositions {
    let accountPositions = this.get(account);
    if (!accountPositions) {
      accountPositions = new Map();
      this.set(account, accountPositions);
    }
    let tokenPositions = accountPositions.get(token);
    if (!tokenPositions) {
      tokenPositions = new TokenPositions();
      accountPositions.set(token, tokenPositions);
    }
    return tokenPositions;
  }

  public shouldDump(currentBlock: number): boolean {
    return currentBlock >= this._lastDumpBlock + this.dumpIntervalBlocks;
  }

  public dumpIfNeeded(path: string, blockNumber: number) {
    if (this.shouldDump(blockNumber)) {
      this.dumpToFile(path, blockNumber);
    }
  }

  public dumpToFile(path: string, blockNumber: number) {
    this.logger.debug(`Dumping accounts positions cache at block ${blockNumber} to ${path}...`);
    timeIt(this.logger, 'Dumping accounts positions cache to file', () => {
      const fp = fs.openSync(path, 'w');
      fs.writeFileSync(fp, `${this.__version}:${blockNumber}\n`);
      for (const [account, tokenPositions] of this.accountPositions.entries()) {
        fs.writeFileSync(fp, `${indent(1)}${account}\n`);
        for (const [token, positions] of tokenPositions.value) {
          fs.writeFileSync(fp, `${indent(2)}${token}\n`);
          for (const line of positions.serialize()) {
            fs.writeFileSync(fp, `${indent(3)}${line}\n`);
          }
        }
      }
      fs.closeSync(fp);
      this._lastDumpBlock = blockNumber;
    });
  }

  public async loadFromFile(path: string, maxAllowedBlock: number) {
    this.logger.info(`Loading accounts positions cache from ${path}...`);
    if (this.loaded) {
      throw new Error('AccountPositionsCache already loaded!');
    }
    if (!fs.existsSync(path)) {
      this.logger.warn(`${path} is empty, cache will be recreated from scratch`);
      this._loaded = true;
      return;
    }
    await timeIt(this.logger, 'Loading accounts positions cache from file', async () => {
      const stream = fs.createReadStream(path);
      const rl = readline.createInterface(stream);
      let currentAccountPositions: Map<string, TokenPositions> | undefined;
      let currentTokenPotisions: TokenPositions | undefined;
      let currentTokenPositionsSerialized: string[] = [];
      const iterator: NodeJS.AsyncIterator<string, undefined, string | undefined> =
        rl[Symbol.asyncIterator]();
      const { value: head } = await iterator.next();
      const [version, blockStr] = (head || '').trim().split(':');
      const block = Number(blockStr);
      if (version !== this.__version) {
        throw new Error(
          `Serialized AccountsPositionsCache version mismatch.\n` +
            `Expected: ${this.__version}, got: ${version}`,
        );
      }
      if (block > maxAllowedBlock) {
        this.logger.warn(
          `Cache dump block (${Number(block)}) > max allowed block (${maxAllowedBlock}), ` +
            `cache will be recreated from scratch`,
        );
        this._loaded = true;
        return;
      }
      for await (const line of iterator) {
        if (line.startsWith(indent(3))) {
          currentTokenPositionsSerialized.push(line.trim());
        } else if (line.startsWith(indent(2))) {
          if (currentTokenPotisions) {
            currentTokenPotisions.loadSerialized(currentTokenPositionsSerialized);
            currentTokenPositionsSerialized = [];
          }
          assert(currentAccountPositions);
          const token = line.trim();
          currentTokenPotisions = new TokenPositions();
          currentAccountPositions.set(token, currentTokenPotisions);
        } else if (line.startsWith(indent(1))) {
          const account = line.trim();
          currentAccountPositions = new Map();
          this.accountPositions.set(account, currentAccountPositions);
        }
      }
      if (currentTokenPotisions) {
        currentTokenPotisions.loadSerialized(currentTokenPositionsSerialized);
        currentTokenPositionsSerialized = [];
      }
      rl.close();
      stream.destroy();
      this._lastDumpBlock = block;
      this._loaded = true;
      this.logger.info(`Loaded cache dump created at block ${block} from ${path}`);
    });
  }
}
