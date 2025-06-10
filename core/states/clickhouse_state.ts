import { ClickHouseError } from '@clickhouse/client';
import { NodeClickHouseClient } from '@clickhouse/client/dist/client';
import { AbstractState, State } from '../state';
import { ClickhouseState, Logger, Offset } from '@sqd-pipes/core';

const table = (table: string) => `
    CREATE TABLE IF NOT EXISTS ${table}
    (
        "id"      String,
        "initial" String,
        "offset"  String,
        "ts"      DateTime(3)
    ) ENGINE = ReplacingMergeTree()
ORDER BY (id)
`;

type Options = {
  database?: string;
  table: string;
  id?: string;
  logger?: Logger;
  onStateRollback?: (state: ClickhouseState, offset: Offset) => Promise<void>;
};
