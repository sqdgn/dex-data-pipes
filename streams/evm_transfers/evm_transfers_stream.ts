import { BlockRef, OptionalArgs, PortalAbstractStream } from '@sqd-pipes/core';
import { events as abi_events } from './abi';
import { HolderCounter, TokenHolders } from './holder_counter';

export type Erc20Event = {
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
};

export class EvmTransfersStream extends PortalAbstractStream<Erc20Event, Args> {
  holderCounter: HolderCounter;

  async initialize() {
    this.holderCounter = new HolderCounter(
      this.options.args.dbPath,
      this.logger,
      this.holdersCallback,
    );
    //await this.holderCounter.init();
  }

  private holdersCallback = async (timestamp: number, holders: TokenHolders[]) => {
    console.log(
      '\nHolders for:',
      new Date(timestamp).toLocaleString(),
      'total tokens:',
      holders.length,
    );
    // const whitelist = [
    //   '0xe55fee191604cdbeb874f87a28ca89aed401c303',
    //   '0xd4a0e0b9149bcee3c920d2e00b5de09138fd8bb7',
    //   '0x31e3cf5e177cd56a4ed5a010edd4e5da4506e2cf',
    // ];
    // holders
    //   .filter((h) => whitelist.includes(h.token))
    //   .forEach((h) => console.log(`${h.token}: ${h.holderCount}`));
    await new Promise((r) => r(1));
  };

  async stream(): Promise<ReadableStream<Erc20Event[]>> {
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

              await this.holderCounter.processTransfer(event);
              allEvents.push(event);
            }
          }
          controller.enqueue(allEvents);
        },
      }),
    );
  }
}
