import '../../../common/bigint_serialization';
import { ClickhouseState } from '@sqd-pipes/core';
import { EvmSwapStream } from '../../../streams/evm_swaps/evm_swap_stream';
import { PriceExtendStream } from '../../../streams/evm_swaps/price_extend_stream';
import { createClickhouseClient, ensureTables, toUnixTime } from '../../clickhouse';
import { events as UniswapV3FactoryEvents } from '../../../streams/evm_swaps/protocols/uniswap.v3/factory';
import { events as UniswapV3PoolEvents } from '../../../streams/evm_swaps/protocols/uniswap.v3/swaps';
import { createLogger } from '../../utils';
import { getConfig } from '../config';
import { chRetry } from '../../../common/chRetry';
import { initializeLogger } from '@sqdgn/context-logging/logger';
import { createPortalSource } from './portal_source';
import { createDecoders } from './evm_decoder';
import { createTarget } from './clickhouse_target';
import { createPipeFunc } from './raw_liquidity_event_pipe';
import assert from 'assert';

const config = getConfig();

const databaseName = process.env.CLICKHOUSE_DB!;

const logger = initializeLogger({
  appName: `pipe_${databaseName}`,
}).get();
logger.info('Starting...');

async function main() {
  const client = await createClickhouseClient();

  await ensureTables(client, __dirname, config.network, databaseName);

  assert(process.env.PORTAL_CACHE_DB_PATH, 'PORTAL_CACHE_DB_PATH param missing');
  const portalSource = await createPortalSource(
    config.portal.url,
    process.env.PORTAL_CACHE_DB_PATH,
  );
  const chTarget = await createTarget(client, logger);
  const decoders = await createDecoders(config.network, config.dbPath, config.blockFrom);
  await portalSource
    .pipeComposite({ ...decoders })
    .pipe(createPipeFunc(config.network))
    .pipeTo(chTarget);
}

void main();
