import { DatabaseSync, StatementSync } from 'node:sqlite';
import { Offset } from '../portal_abstract_stream';
import { AbstractState, State } from '../state';

type Options = { network?: string; table: string };

export class SqliteState extends AbstractState implements State {
  options: Required<Options>;
  statements: Record<'update' | 'select' | 'insert', StatementSync>;

  constructor(
    private client: DatabaseSync,
    options: Options,
  ) {
    super();

    this.options = {
      network: 'stream',
      ...options,
    };

    try {
      this.prepare();
    } catch (e) {
      if (e instanceof Error && e.message.includes('no such table')) {
        this.client.exec(`
            CREATE TABLE IF NOT EXISTS ${this.options.table}
            (
                id      TEXT PRIMARY KEY,
                initial TEXT,
                current TEXT
            )
        `);

        this.prepare();
        return;
      }

      throw e;
    }
  }

  prepare() {
    this.statements = {
      select: this.client.prepare(`
          SELECT *
          FROM "${this.options.table}"
          WHERE "id" = :id
      `),
      update: this.client.prepare(`
          UPDATE "${this.options.table}"
          SET "current" = :current
          WHERE "id" = :id
      `),
      insert: this.client.prepare(`
          INSERT INTO "${this.options.table}" (id, current, initial)
          VALUES (:id, :current, :initial)
      `),
    };
  }

  async saveOffset(offset: Offset) {
    const res = this.statements.update.run({
      current: this.encodeOffset(offset),
      id: this.options.network,
    });

    if (res.changes === 0) {
      throw new Error(
        `Failed to update offset for "${this.options.network}" in table "${this.options.table}"`,
      );
    }
  }

  async getOffset(defaultValue: Offset) {
    const row = this.statements.select.get({ id: this.options.network }) as
      | { initial: string; current: string }
      | undefined;

    if (row) {
      return {
        current: this.decodeOffset(row.current),
        initial: this.decodeOffset(row.initial),
      };
    }

    const encoded = this.encodeOffset(defaultValue);
    this.statements.insert.run({
      current: encoded,
      id: this.options.network,
      initial: encoded,
    });

    return { current: defaultValue, initial: defaultValue };
  }
}
