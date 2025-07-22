import { DexName, DexProtocol, Network, NetworksMappings } from './networks';
import { PoolMetadata, PoolMetadataStorage } from './pool_metadata_storage';
import { DecodedEvmSwap, EvmSwap } from './swap_types';

import { nonNullable } from './util';
import { TokenMetadataStorage } from './token_metadata_storage';
import { PortalAbstractStream } from '@sqd-pipes/core';
import { EventRecord } from '@subsquid/evm-abi';
import { findPoolMetadata, findSwap } from './protocol_mappings';
import { inspect } from 'util';

type Args = {
  network: Network;
  dbPath: string;
  onlyPools?: boolean;
};

function getHumanAmount(token: {
  amount_raw: bigint;
  address: string;
  decimals?: number;
}) {
  return Number(token.amount_raw) / 10 ** (token.decimals === undefined ? 18 : token.decimals);
}

export class EvmSwapStream extends PortalAbstractStream<EvmSwap, Args> {
  poolMetadataStorage: PoolMetadataStorage;
  tokenOnchainHelper: TokenMetadataStorage;

  initialize() {
    this.poolMetadataStorage = new PoolMetadataStorage(
      this.options.args.dbPath,
      this.options.args.network,
    );
    this.tokenOnchainHelper = new TokenMetadataStorage(
      this.options.args.dbPath,
      this.logger,
      this.options.args.network,
    );
  }

  async stream(): Promise<ReadableStream<EvmSwap[]>> {
    const { args } = this.options;

    // by default, request information about all dexes
    const dexNames = Object.keys(NetworksMappings[args.network]).map((p) => p as DexName);

    const source = await this.getStream({
      type: 'evm',
      fields: {
        block: {
          number: true,
          hash: true,
          timestamp: true,
        },
        transaction: {
          from: true,
          to: true,
          hash: true,
        },
        log: {
          address: true,
          topics: true,
          data: true,
          transactionHash: true,
          logIndex: true,
          transactionIndex: true,
        },
      },
      logs: dexNames.flatMap((dexName) => {
        const resMappings: any = [];
        const protocols = NetworksMappings[args.network][dexName];

        for (const protocol in protocols) {
          const protocolMapping = NetworksMappings[args.network][dexName]![protocol];
          resMappings.push(protocolMapping.pools);
          if (!args.onlyPools) {
            resMappings.push(protocolMapping.swaps);
          }
        }

        return resMappings;
      }),
    });

    return source.pipeThrough(
      new TransformStream({
        transform: async ({ blocks }, controller) => {
          this.handlePools(blocks);

          if (args.onlyPools) {
            // FIXME bad design
            controller.enqueue([]);
            return;
          }

          const events = blocks
            .flatMap((block: any) => {
              if (!block.logs || !block.transactions) return [];

              return block.logs.map((log) => {
                const transaction = block.transactions.find(
                  (tx) => tx.hash === log.transactionHash,
                );
                if (!transaction) {
                  this.logger.error(
                    `transaction not found ${log.transactionHash} in block ${block.header.number}`,
                  );
                  return null;
                }

                // FIXME: bad design, improve if/when another DEX with Uniswap V4 protocol is added.
                const uniswapV4Swap =
                  NetworksMappings[args.network].uniswap?.uniswap_v4?.factoryAddress ===
                  log.address;

                let poolMetadata: PoolMetadata | undefined;
                let swap: DecodedEvmSwap | null;
                let poolAddress: string;

                if (uniswapV4Swap) {
                  swap = findSwap(log, {
                    network: args.network,
                    dex_name: 'uniswap',
                    protocol: 'uniswap_v4',
                  });
                  if (!swap?.id) {
                    return null;
                  }
                  poolMetadata = this.poolMetadataStorage.getPoolMetadata(swap.id);
                  if (!poolMetadata) {
                    return null;
                  }
                  poolAddress = swap.id;
                } else {
                  poolMetadata = this.poolMetadataStorage.getPoolMetadata(log.address);
                  if (!poolMetadata) {
                    return null;
                  }
                  swap = findSwap(log, poolMetadata);
                  if (!swap) {
                    return null;
                  }
                  poolAddress = log.address;
                }

                const tokenA_Metadata = this.tokenOnchainHelper.getTokenMetadata(
                  poolMetadata.token_a,
                );
                const tokenB_Metadata = this.tokenOnchainHelper.getTokenMetadata(
                  poolMetadata.token_b,
                );

                const resSwap = {
                  dexName: poolMetadata.dex_name,
                  protocol: poolMetadata.protocol,
                  account: transaction.from,
                  sender: swap.from.sender,
                  recipient: swap.to.recipient,
                  tokenA: {
                    amount_raw: swap.from.amount,
                    amount_human: -1, // compute later
                    address: poolMetadata.token_a,
                    decimals: tokenA_Metadata?.decimals,
                    symbol: tokenA_Metadata?.symbol,
                  },
                  tokenB: {
                    amount_raw: swap.to.amount,
                    amount_human: -1, // compute later
                    address: poolMetadata.token_b,
                    decimals: tokenB_Metadata?.decimals,
                    symbol: tokenB_Metadata?.symbol,
                  },
                  pool: {
                    address: poolAddress,
                    tick_spacing: poolMetadata.tick_spacing,
                    fee: poolMetadata.fee,
                    stable:
                      poolMetadata.stable === undefined ? undefined : poolMetadata.stable === 1,
                    liquidity: swap.liquidity,
                    sqrtPriceX96: swap.sqrtPriceX96,
                    tick: swap.tick,
                  },
                  factory: {
                    address: poolMetadata.factory_address,
                  },
                  block: block.header,
                  transaction: {
                    hash: log.transactionHash,
                    index: log.transactionIndex,
                    logIndex: log.logIndex,
                  },
                  timestamp: new Date(block.header.timestamp * 1000),
                } satisfies EvmSwap;

                return resSwap;
              });
            })
            .filter(Boolean);

          if (!events.length) {
            await this.ack();
            return;
          }

          try {
            await this.tokenOnchainHelper.enrichWithTokenData(events);
          } catch (err) {
            this.logger.error(`Failed to enrich token data: ${inspect(err)}`);
          }

          // calc human amounts
          for (const s of events) {
            const swap = s as EvmSwap;
            swap.tokenA.amount_human = getHumanAmount(swap.tokenA);
            swap.tokenB.amount_human = getHumanAmount(swap.tokenB);
          }
          controller.enqueue(events);
        },
      }),
    );
  }

  private handlePools(blocks: any[]) {
    const { args } = this.options;

    const pools = blocks
      .flatMap((block: any) => {
        if (!block.logs) return [];

        return block.logs.map((l) => findPoolMetadata(l, block, args.network));
      })
      .filter(nonNullable);
    if (pools.length) {
      this.poolMetadataStorage.savePoolMetadataIntoDb(pools);
    }
  }
}
