import assert from 'assert';
import dotenv from 'dotenv';
import { Network, NetworkValues } from '../../streams/evm_swaps/networks';

dotenv.config();

export const CONTRACTS = {
  factory: {
    base: {
      address: '0x33128a8fc17869897dce68ed026d694621f6fdfd',
      block: {
        number: 18112225,
      },
    },
    ethereum: {
      address: '0x1f98431c8ad98523631ae4a59f267346ea31f984',
      block: {
        number: 12369621,
      },
    },
  },
};

const PORTAL = {
  base: {
    url: 'https://portal.sqd.dev/datasets/base-mainnet',
  },
  ethereum: {
    url: 'https://portal.sqd.dev/datasets/ethereum-mainnet',
  },
  zora: {
    url: 'https://portal.sqd.dev/datasets/zora-mainnet',
  },
};

export function getConfig() {
  const network = (process.env.NETWORK || '') as Network;
  assert(NetworkValues.includes(network), 'unsupported network is specified in .env');

  process.env.NETWORK === 'ethereum' || process.env.NETWORK === 'base'
    ? process.env.NETWORK
    : 'ethereum';

  const blockFrom = process.env.BLOCK_FROM ? parseInt(process.env.BLOCK_FROM) : 0;
  assert(process.env.DB_PATH, 'DB_PATH param must be specified');

  return {
    network: network,
    factory: CONTRACTS.factory[network],
    dbPath: process.env.DB_PATH,
    portal: PORTAL[network],
    blockFrom,
  };
}
