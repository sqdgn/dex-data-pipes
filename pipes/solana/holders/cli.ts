import path from 'node:path';
import { ClickhouseState } from '@sqd-pipes/core';
import { createClickhouseClient, ensureTables } from '../../clickhouse';
import { createLogger } from '../../utils';
import { getConfig } from './config';
import { SolanaHoldersStream } from '../../../streams/svm_swaps/holders-stream';
import { timeIt } from '../../../streams/svm_swaps/utils';

const config = getConfig();

const logger = createLogger('solana holders');

async function main() {
  Error.stackTraceLimit = 1000;
  const clickhouse = await createClickhouseClient({
    capture_enhanced_stack_trace: true,
  });
  await ensureTables(clickhouse, path.join(__dirname, 'sql'));

  const ds = new SolanaHoldersStream({
    args: {
      clickhouse,
    },
    portal: config.portalUrl,
    blockRange: {
      from: config.blockFrom,
      to: config.blockTo,
    },
    logger,
    state: new ClickhouseState(clickhouse, {
      table: `sync_status`,
      database: process.env.CLICKHOUSE_DB,
      id: `slp_holders`,
      onRollback: async ({ state, latest }) => {
        if (!latest.timestamp) {
          return; // fresh table
        }
        await state.removeAllRows({
          table: `slp_holders`,
          where: `timestamp > ${latest.timestamp}`,
        });
      },
    }),
  });

  for await (const holdersEntries of await ds.stream()) {
    await timeIt(logger, 'Inserting to Clickhouse', () =>
      clickhouse.insert({
        table: `slp_holders`,
        values: holdersEntries,
        format: 'JSONEachRow',
      }),
    );
    await ds.ack();
  }
}

void main();
