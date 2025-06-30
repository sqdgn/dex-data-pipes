import path from 'node:path';
import { EvmTransfersStream } from '../../../streams/evm_transfers/evm_transfers_stream';
import { createClickhouseClient, ensureTables, toUnixTime } from '../../clickhouse';
import { createLogger, formatNumber } from '../../utils';
import { getConfig } from '../config';
import { ClickhouseState } from '@sqd-pipes/core';

const config = getConfig();

const clickhouse = createClickhouseClient();
const logger = createLogger('erc20').child({ network: config.network });

async function main() {
  await ensureTables(clickhouse, __dirname, config.networkUnderscored);

  const ds = new EvmTransfersStream({
    portal: config.portal.url,
    blockRange: {
      from: config.blockFrom,
    },
    args: {
      dbPath: config.holdersDbPath,
      networkUnderscored: config.networkUnderscored,
      holderClickhouseCliend: clickhouse,
    },
    logger,
    state: new ClickhouseState(clickhouse, {
      table: `${config.networkUnderscored}_transfers_sync_status`,
      id: `${config.networkUnderscored}-transfers`,
      onRollback: async ({ state, latest }) => {
        await state.removeAllRows({
          table: `${config.networkUnderscored}_erc20_transfers`,
          where: 'block_number > {bl:UInt32}',
          params: { bl: latest.number },
        });
      },
    }),
  });
  await ds.initialize();

  for await (const transfers of await ds.stream()) {
    await clickhouse.insert({
      table: `${config.networkUnderscored}_erc20_transfers`,
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
