import { ClickhouseState } from '@sqd-pipes/core';
import {
  createClickhouseClient,
  ensureTables,
  toUnixTime,
} from '../../clickhouse';
import { createLogger } from '../../utils';
import { getConfig } from '../config';
import { SolanaSwapsStream } from '../../../streams/svm_swaps';
import { PriceExtendStream } from '../../../streams/svm_swaps/price-extend-stream';
import { asDecimalString } from '../../../streams/svm_swaps/utils';

const config = getConfig();

const logger = createLogger('solana dex swaps');

logger.info(`Local database: ${config.dbPath}`);

async function main() {
  const clickhouse = await createClickhouseClient();
  await ensureTables(clickhouse, __dirname);

  const ds = new SolanaSwapsStream({
    portal: config.portalUrl,
    blockRange: {
      from: config.blockFrom,
      to: config.blockTo,
    },
    args: {
      dbPath: config.dbPath,
      onlyTokens: config.onlyTokens,
    },
    logger,
    state: new ClickhouseState(clickhouse, {
      database: process.env.CLICKHOUSE_DB,
      table: `sync_status`,
      id: `swaps`,
      onRollback: async ({ state, latest }) => {
        if (!latest.timestamp) {
          return; // fresh table
        }
        await state.removeAllRows({
          table: `solana_swaps_raw`,
          where: `timestamp > ${latest.timestamp}`,
        });
        // TODO: What about tokens metadata?
      },
    }),
  });
  ds.initialize();

  const stream = await ds.stream();
  for await (const swaps of stream.pipeThrough(
    await new PriceExtendStream(clickhouse).pipe()
  )) {
    logger.info(`Saving ${swaps.length} swaps...`);
    await clickhouse.insert({
      table: `solana_swaps_raw`,
      values: swaps.map((s) => {
        const obj = {
          // Name of the DEX
          dex: s.type,
          // Blockchain data
          block_number: s.block.number,
          transaction_hash: s.transaction.hash,
          transaction_index: s.transaction.index,
          instruction_address: s.instruction.address,
          // Account which executed the swap
          account: s.account,
          // Mint accounts of the tokens
          token_a: s.baseToken.mintAcc,
          token_b: s.quoteToken.mintAcc,
          // Amounts of the tokens exchanged
          amount_a: asDecimalString(s.baseToken.amount, s.baseToken.decimals),
          amount_b: asDecimalString(s.quoteToken.amount, s.quoteToken.decimals),
          // Tokens metadata
          token_a_decimals: s.baseToken.decimals,
          token_a_symbol: s.baseToken.symbol || '[unknown]',
          token_b_decimals: s.quoteToken.decimals,
          token_b_symbol: s.quoteToken.symbol || '[unknown]',
          // Token prices
          token_a_usdc_price: s.baseToken.usdcPrice,
          token_b_usdc_price: s.quoteToken.usdcPrice,
          // Trader stats
          token_a_balance: s.baseToken.balance,
          token_b_balance: s.quoteToken.balance,
          token_a_profit_usdc: s.baseToken.profitUsdc,
          token_b_profit_usdc: s.quoteToken.profitUsdc,
          token_a_cost_usdc: s.baseToken.costUsdc,
          token_b_cost_usdc: s.quoteToken.costUsdc,
          token_a_acquisition_cost_usd: s.baseToken.tokenAcquisitionCostUsd,
          token_b_acquisition_cost_usd: s.quoteToken.tokenAcquisitionCostUsd,
          // Timestamp
          timestamp: toUnixTime(s.timestamp),
          // Slippage
          slippage: s.slippage,
          // Pool data
          pool_address: s.poolAddress,
          pool_token_a_reserve: asDecimalString(
            s.baseToken.reserves || 0n,
            s.baseToken.decimals
          ),
          pool_token_b_reserve: asDecimalString(
            s.quoteToken.reserves || 0n,
            s.quoteToken.decimals
          ),
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
