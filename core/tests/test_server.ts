import { IncomingMessage, Server, ServerResponse, createServer } from 'http';

export type MockData<T extends {} = {}> = T & {
  header: {
    number: number;
    hash: string;
    timestamp: number;
  };
};

type MockResponse =
  | {
      statusCode: 200;
      data: {
        header: {
          number: number;
          hash: string;
          timestamp: number;
        };
      }[];
    }
  | {
      statusCode: 409;
      data: {
        lastBlocks: {
          number: number;
          hash: string;
        }[];
      };
    };

export type MockPortal = { server: Server; url: string };

export async function createTestPortal<T extends {} = any>(
  mockResponses: MockResponse[],
): Promise<MockPortal> {
  const promise = new Promise<Server>((resolve) => {
    let requestCount = 0;

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (req.url === '/stream') {
        const mockResp = mockResponses[0];

        if (mockResp.statusCode === 200) {
          // Send each mock data item as a JSON line
          mockResp.data.forEach((data) => {
            res.write(JSON.stringify(data) + '\n');
          });
        } else if (mockResp.statusCode === 409) {
          res.write(JSON.stringify(mockResp.data));
        }

        res.statusCode = mockResp.statusCode;
        requestCount++;

        res.end();
      } else {
        res.statusCode = 404;
        res.end();
      }
    });

    server.listen(0, () => {
      resolve(server);
    });
  });

  const server = await promise;

  return { server, url: getServerAddress(server) };
}

function getServerAddress(server: Server): string {
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Invalid server address');
  }
  return `http://localhost:${address.port}`;
}

export async function readAll<T>(stream: ReadableStream<T>) {
  const res: T[] = [];
  // Use for await...of loop to read the stream
  for await (const chunk of stream) {
    res.push(chunk);
  }

  return res;
}
