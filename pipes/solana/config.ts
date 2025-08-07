import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_PORTAL_URL = 'https://portal.sqd.dev/datasets/solana-mainnet';

export function getCommonConfig() {
  const blockFrom = process.env.BLOCK_FROM ? parseInt(process.env.BLOCK_FROM) : 317617480; // FIXME: Currently this is the oldest block available from SQL portal
  const blockTo = process.env.BLOCK_TO ? parseInt(process.env.BLOCK_TO) : undefined;
  const portalUrl = process.env.PORTAL_URL || DEFAULT_PORTAL_URL;

  return {
    portalUrl,
    blockFrom,
    blockTo,
  };
}
