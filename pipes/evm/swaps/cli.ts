import { ClickhouseState } from '@sqd-pipes/core';
import { EvmSwapStream } from '../../../streams/evm_swaps/evm_swap_stream';
import { PriceExtendStream } from '../../../streams/evm_swaps/price_extend_stream';
import { createClickhouseClient, ensureTables, toUnixTime } from '../../clickhouse';
import { createLogger } from '../../utils';
import { getConfig } from '../config';

const config = getConfig();

const logger = createLogger('evm dex swaps').child({ network: config.network });

logger.info(`Local database: ${config.dbPath}`);

async function main() {
  const clickhouse = await createClickhouseClient();
  await ensureTables(clickhouse, __dirname);

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
      database: process.env.CLICKHOUSE_DB,
      table: `sync_status`,
      id: `swaps${!!process.env.BLOCK_TO ? '-pools' : ''}`,
      onRollback: async ({ state, latest }) => {
        if (!latest.timestamp) {
          return; // fresh table
        }
        await state.removeAllRows({
          table: `swaps_raw`,
          where: `timestamp > ${latest.timestamp}`,
        });
      },
    }),
  });
  ds.initialize();

  const stream = await ds.stream();
  for await (const swaps of stream.pipeThrough(
    await new PriceExtendStream(clickhouse, config.network, logger).pipe(),
  )) {
    await clickhouse.insert({
      table: `swaps_raw`,
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
          // trader stats
          token_a_balance: s.token_a_balance,
          token_b_balance: s.token_b_balance,
          token_a_profit_usdc: s.token_a_profit_usdc,
          token_b_profit_usdc: s.token_b_profit_usdc,
          token_a_cost_usdc: s.token_a_cost_usdc,
          token_b_cost_usdc: s.token_b_cost_usdc,
          token_a_wins: s.token_a_wins,
          token_b_wins: s.token_b_wins,
          token_a_loses: s.token_a_loses,
          token_b_loses: s.token_b_loses,
          // end trader stats
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
