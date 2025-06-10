import path from 'node:path';
import { EvmSwapStream } from '../../../streams/evm_swaps/evm_swap_stream';
import { createClickhouseClient, ensureTables, toUnixTime } from '../../clickhouse';
import { createLogger } from '../../utils';
import { getConfig } from '../config';
import { Network } from 'streams/evm_swaps/networks';
import { PriceExtendStream } from '../../../streams/evm_swaps/price_extend_stream';
import { ClickhouseState } from '@sqd-pipes/core';

const config = getConfig();

const clickhouse = createClickhouseClient();

const logger = createLogger('evm dex swaps').child({ network: config.network });

logger.info(`Local database: ${config.dbPath}`);

async function main() {
  const networkUnderscore = (config.network || '').replace('-', '_');

  await ensureTables(clickhouse, __dirname, networkUnderscore);

  const ds = new EvmSwapStream({
    portal: process.env.PORTAL_URL ?? config.portal.url,
    blockRange: {
      from: process.env.BLOCK_FROM || 0,
      to: process.env.BLOCK_TO,
    },
    args: {
      network: config.network,
      /**
       * Pool metadata is stored in a local SQLite database.
       * We need metadata to filter out pools that are not interesting to us
       * and to expand the pool into a list of tokens within it.
       */
      dbPath: config.dbPath,
      onlyPools: !!process.env.BLOCK_TO,
    },
    logger,
    state: new ClickhouseState(clickhouse, {
      table: `${networkUnderscore}_sync_status`,
      id: `${networkUnderscore}-swaps${!!process.env.BLOCK_TO ? '-pools' : ''}`,
      onStateRollback: async (state, current) => {
        /**
         * Clean all data before the current offset.
         * There is a small chance if the stream is interrupted, the data will be duplicated.
         * We just clean it up at the start to avoid duplicates.
         */

        await state.cleanAllBeforeOffset({
          table: `${networkUnderscore}_swaps_raw`,
          column: 'timestamp',
          offset: current.timestamp,
        });
      },
    }),
  });
  ds.initialize();

  const stream = await ds.stream();
  for await (const swaps of stream.pipeThrough(
    await new PriceExtendStream(clickhouse, config.network).pipe(),
  )) {
    await clickhouse.insert({
      table: `${config.network}_swaps_raw`,
      values: swaps.map((s) => {
        const obj = {
          factory_address: s.factory.address,
          network: config.network,
          dex_name: s.dexName,
          protocol: s.protocol,
          block_number: s.block.number,
          transaction_hash: s.transaction.hash,
          transaction_index: s.transaction.index,
          log_index: s.transaction.logIndex,
          account: s.account,
          sender: s.sender,
          recipient: s.recipient,
          token_a: s.tokenA.address,
          token_a_decimals: s.tokenA.decimals,
          token_a_symbol: s.tokenA.symbol,
          token_b: s.tokenB.address,
          token_b_decimals: s.tokenB.decimals,
          token_b_symbol: s.tokenB.symbol,
          price_token_a_usdc: s.price_token_a_usdc,
          price_token_b_usdc: s.price_token_b_usdc,
          amount_a_raw: s.tokenA.amount_raw.toString(),
          amount_b_raw: s.tokenB.amount_raw.toString(),
          amount_a: s.tokenA.amount_human.toString(),
          amount_b: s.tokenB.amount_human.toString(),
          pool_address: s.pool.address,
          pool_tick_spacing: s.pool.tick_spacing,
          pool_fee_creation: s.pool.fee,
          pool_stable: s.pool.stable,
          pool_liquidity: s.pool.liquidity !== undefined ? s.pool.liquidity.toString() : undefined,
          pool_sqrt_price_x96:
            s.pool.sqrtPriceX96 !== undefined ? s.pool.sqrtPriceX96.toString() : undefined,
          pool_tick: s.pool.tick,
          timestamp: toUnixTime(s.timestamp),
          a_b_swapped: s.a_b_swapped,
          sign: 1,
        };
        return obj;
      }),
      format: 'JSONEachRow',
    });
    await ds.ack();
  }
}

void main();
