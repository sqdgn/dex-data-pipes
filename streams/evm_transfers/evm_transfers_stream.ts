import { BlockRef, OptionalArgs, PortalAbstractStream } from '@sqd-pipes/core';
import { events as abi_events } from './abi';
import { HolderCounter, TokenHolders } from './holder_counter';
import { NodeClickHouseClient } from '@clickhouse/client/dist/client';
import { toUnixTime } from '../../pipes/clickhouse';
import { timeStamp } from 'console';

export type Erc20Transfer = {
  from: string;
  to: string;
  amount: bigint;
  token_address: string;
  block: BlockRef;
  tx: string;
  transaction: {
    hash: string;
    index: number;
    logIndex: number;
  };
  timestamp: Date;
};

type Args = {
  dbPath: string;
  contracts?: string[];
  holderClickhouseCliend: NodeClickHouseClient;
  onlyFirstTransfers: boolean;
};

export class EvmTransfersStream extends PortalAbstractStream<Erc20Transfer, Args> {
  holderCounter: HolderCounter;
  lastTimeHoldersStatsPrinted = 0;

  async initialize() {
    this.holderCounter = new HolderCounter(
      this.options.args.dbPath,
      this.logger,
      this.holdersHook,
      this.firstTransferHook,
    );
  }

  private firstTransferHook = async (transfer: Erc20Transfer) => {
    await this.options.args.holderClickhouseCliend.insert({
      table: `erc20_first_transfers`,
      values: [
        {
          timestamp: toUnixTime(transfer.timestamp),
          token: transfer.token_address,
          from: transfer.from,
          to: transfer.to,
          amount: transfer.amount.toString(),
          block_number: transfer.block.number,
          transaction_index: transfer.transaction.index,
          log_index: transfer.transaction.logIndex,
          transaction_hash: transfer.transaction.hash,
        },
      ],
      format: 'JSONEachRow',
    });
  };

  private holdersHook = async (timestamp: number, holders: TokenHolders[]) => {
    if (!holders.length) {
      return;
    }

    await this.options.args.holderClickhouseCliend.insert({
      table: `erc20_holders`,
      values: holders.map((h) => ({
        timestamp: Math.floor(timestamp / 1000),
        token: h.token,
        holders: h.holderCount,
      })),
      format: 'JSONEachRow',
    });

    if (Date.now() - this.lastTimeHoldersStatsPrinted >= 1000) {
      // not often than 1 in a second
      this.logger.info(
        `Holders for: ${new Date(timestamp).toLocaleString()} total tokens: ${holders.length}`,
      );
      this.lastTimeHoldersStatsPrinted = Date.now();
    }
  };

  async stream(): Promise<ReadableStream<Erc20Transfer[]>> {
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
      logs: [
        {
          address: this.options.args?.contracts,
          topic0: [abi_events.Transfer.topic],
        },
      ],
    });

    return source.pipeThrough(
      new TransformStream({
        transform: async ({ blocks }, controller) => {
          // FIXME any
          const allEvents: any[] = [];
          for (const b of blocks) {
            const block: any = b;

            if (!block.logs) {
              continue;
            }

            const transferLogs = block.logs.filter((l: any) => abi_events.Transfer.is(l)) as any[];

            for (const l of transferLogs) {
              const data = abi_events.Transfer.decode(l);
              const event = {
                from: data.from,
                to: data.to,
                amount: data.value,
                token_address: l.address,
                block: block.header,
                transaction: {
                  hash: l.transactionHash,
                  index: l.transactionIndex,
                  logIndex: l.logIndex,
                },
                timestamp: new Date(block.header.timestamp * 1000),
                tx: l.transactionHash,
              };

              await this.holderCounter.processTransfer(event, this.options.args.onlyFirstTransfers);

              allEvents.push(event);
            }
          }
          controller.enqueue(allEvents);
        },
      }),
    );
  }
}
