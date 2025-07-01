import path from 'node:path';
import { EvmTransfersStream } from '../../../streams/evm_transfers/evm_transfers_stream';
import { createClickhouseClient, ensureTables, toUnixTime } from '../../clickhouse';
import { createLogger, formatNumber } from '../../utils';
import { getConfig } from '../config';
import { ClickhouseState } from '@sqd-pipes/core';

const config = getConfig();

const logger = createLogger('erc20').child({ network: config.network });

async function main() {
  const clickhouse = await createClickhouseClient();
  await ensureTables(clickhouse, __dirname);

  const ds = new EvmTransfersStream({
    portal: config.portal.url,
    blockRange: {
      from: config.blockFrom,
      to: process.env.BLOCK_TO,
    },
    args: {
      dbPath: config.dbPath,
      holderClickhouseCliend: clickhouse,
      noHolders: !!process.env.BLOCK_TO,
    },
    logger,
    state: new ClickhouseState(clickhouse, {
      table: `sync_status`,
      database: process.env.CLICKHOUSE_DB,
      id: `erc20_transfers`,
      onRollback: async ({ state, latest }) => {
        await state.removeAllRows({
          table: `erc20_transfers`,
          where: 'block_number > {bl:UInt32}',
          params: { bl: latest.number },
        });
      },
    }),
  });
  await ds.initialize();

  for await (const transfers of await ds.stream()) {
    await clickhouse.insert({
      table: `erc20_transfers`,
      values: transfers.map((t) => {
        return {
          block_number: t.block.number,
          transaction_hash: t.transaction.hash,
          transaction_index: t.transaction.index,
          log_index: t.transaction.logIndex,
          token: t.token_address,
          from: t.from,
          to: t.to,
          amount: t.amount.toString(),
          timestamp: toUnixTime(t.timestamp),
          sign: 1,
        };
      }),
      format: 'JSONEachRow',
    });

    await ds.ack();
  }
}

void main();
