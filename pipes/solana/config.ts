import assert from 'assert';
import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_PORTAL_URL = 'https://portal.sqd.dev/datasets/solana-mainnet';

export function getConfig() {
  const dbPath = process.env.DB_PATH;
  const blockFrom = process.env.BLOCK_FROM
    ? parseInt(process.env.BLOCK_FROM)
    : 317617480; // FIXME: Currently this is the oldest block available from SQL portal
  const blockTo = process.env.BLOCK_TO
    ? parseInt(process.env.BLOCK_TO)
    : undefined;
  const onlyTokens = ['t', 'T', 'true', '1'].includes(
    process.env.ONLY_TOKENS || ''
  );
  const portalUrl = process.env.PORTAL_URL || DEFAULT_PORTAL_URL;

  assert(dbPath, 'DB_PATH param must be specified');

  return {
    dbPath,
    portalUrl,
    blockFrom,
    blockTo,
    onlyTokens,
  };
}
