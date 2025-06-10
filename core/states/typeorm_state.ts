import { DataSource, EntityManager } from 'typeorm';
import { Offset } from '../portal_abstract_stream';
import { AbstractState, State } from '../state';

export type TypeormAckArgs = [EntityManager];

export class TypeormState extends AbstractState implements State<TypeormAckArgs> {
  constructor(
    private db: DataSource,
    private options: { table: string; namespace?: string; id?: string },
  ) {
    super();

    this.options = {
      namespace: 'public',
      id: 'stream',
      ...options,
    };
  }

  async saveOffset(offset: Offset, manager: EntityManager) {
    await manager.query(
      `UPDATE "${this.options.namespace}"."${this.options.table}"
       SET offset = $1
       WHERE id = $3`,
      [this.encodeOffset(offset), this.options.id],
    );
  }

  async getOffset() {
    try {
      const state = await this.db.query<{ current: string; initial: string }[]>(
        `SELECT *
         FROM "${this.options.namespace}"."${this.options.table}"
         WHERE id = $1
         LIMIT 1`,
        [this.options.id],
      );
      const [row] = state;

      if (row) {
        // FIXME save initial
        return {
          current: this.decodeOffset(row.current),
          initial: this.decodeOffset(row.initial),
        };
      }
    } catch (e: any) {
      if (e.code === '42P01') {
        await this.db.transaction(async (manager) => {
          await manager.query(
            `CREATE TABLE IF NOT EXISTS "${this.options.namespace}"."${this.options.table}"
             (
                 "id"     TEXT,
                 "current" TEXT,
                 "initial" TEXT
             )`,
          );
          await manager.query(
            `INSERT INTO "${this.options.namespace}"."${this.options.table}" (id, offset)
             VALUES ($1, $2)`,
            [this.options.id, ''],
          );
        });

        return;
      }

      throw e;
    }

    return;
  }
}
