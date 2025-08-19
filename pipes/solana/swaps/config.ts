import assert from 'assert';
import { getCommonConfig } from '../config';

export function getConfig() {
  const commonConfig = getCommonConfig();
  const dbPath = process.env.DB_PATH;
  const cacheDumpPath = process.env.CACHE_DUMP_PATH;
  const cacheDumpIntervalBlocks = parseInt(process.env.CACHE_DUMP_INTERVAL_BLOCKS || '0');
  const onlyMeta = ['t', 'T', 'true', '1'].includes(process.env.ONLY_META || '');

  assert(dbPath, 'DB_PATH param must be specified');
  assert(cacheDumpPath, 'CACHE_DUMP_PATH param must be specified');

  return {
    ...commonConfig,
    dbPath,
    cacheDumpPath,
    cacheDumpIntervalBlocks,
    onlyMeta,
  };
}
