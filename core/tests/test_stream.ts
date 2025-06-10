import { PortalAbstractStream } from '../portal_abstract_stream';

export class TestStream extends PortalAbstractStream<any> {
  async stream(): Promise<ReadableStream<any>> {
    return await this.getStream({
      type: 'evm',
      fields: {
        block: {
          number: true,
          hash: true,
          timestamp: true,
        },
      },
    });
  }
}
