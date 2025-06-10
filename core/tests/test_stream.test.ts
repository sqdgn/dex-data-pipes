import { afterEach, describe, expect, it } from 'vitest';
import { MockData, MockPortal, createTestPortal, readAll } from './test_server';
import { TestStream } from './test_stream';

describe('Portal stream', () => {
  let testStream: TestStream;
  let mockPortal: MockPortal;

  afterEach(() => {
    mockPortal?.server.close();
  });

  it('should receive and process stream data correctly', async () => {
    const mockData: MockData[] = [
      { header: { number: 1, hash: '0x123', timestamp: 1000 } },
      { header: { number: 2, hash: '0x456', timestamp: 2000 } },
    ];

    mockPortal = await createTestPortal([
      {
        statusCode: 200,
        data: mockData,
      },
    ]);

    testStream = new TestStream({
      portal: mockPortal.url,
      blockRange: { from: 0, to: 2 },
    });

    const stream = await testStream.stream();

    const [res] = await readAll(stream);

    expect(res).toMatchObject({
      blocks: [
        { header: { number: 1, hash: '0x123', timestamp: 1000 } },
        { header: { number: 2, hash: '0x456', timestamp: 2000 } },
      ],
      finalizedHead: undefined,
    });
  });

  // it('should handle reorg', async () => {
  //   mockPortal = await createTestPortal([
  //     {
  //       statusCode: 200,
  //       data: [
  //         { header: { number: 1, hash: '0x001', timestamp: 1000 } },
  //         { header: { number: 2, hash: '0x002', timestamp: 2000 } },
  //         { header: { number: 3, hash: '0x003', timestamp: 2000 } },
  //       ],
  //     },
  //     {
  //       // Revert to block 2
  //       statusCode: 409,
  //       data: {
  //         lastBlocks: [
  //           {
  //             number: 2,
  //             hash: '0x002-a',
  //           },
  //           {
  //             number: 3,
  //             hash: '0x003-a',
  //           },
  //         ],
  //       },
  //     },
  //     {
  //       statusCode: 200,
  //       data: [
  //         { header: { number: 2, hash: '0x001-a', timestamp: 2000 } },
  //         { header: { number: 3, hash: '0x003-a', timestamp: 2000 } },
  //       ],
  //     },
  //   ]);
  //
  //   testStream = new TestStream({
  //     portal: mockPortal.url,
  //     blockRange: { from: 0, to: 5 },
  //   });
  //
  //   const stream = await testStream.stream();
  //   const [res] = await readAll(stream);
  //
  //   expect(true).toBe(true);
  // });
});
