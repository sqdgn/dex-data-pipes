import { Logger } from 'pino';

const RETRY_ERRORS = ['ECONNREFUSED', 'ECONNRESET', 'EPIPE'];

export const chRetry = async <T>(
  logger: Logger,
  operationDescription: string = '',
  func: () => Promise<T>,
): Promise<T> => {
  let res: Awaited<T>;
  let retries = 0;

  const opText = operationDescription ? `${operationDescription}: ` : '';
  while (true) {
    try {
      res = await func();
      if (retries > 0) {
        logger.info(`chRetry: ${opText}success on ${retries} retry`);
      }
      return res;
    } catch (err) {
      if (err instanceof Error && 'code' in err && RETRY_ERRORS.includes(err.code as string)) {
        retries++;
        logger.warn(`chRetry: ${opText}socket error. Retrying ${retries}`);

        if (retries > 5) {
          logger.error(`chRetry: ${opText}socket error. Max errors reached`);
          throw err;
        }
      } else {
        throw err;
      }
    }
  }
};
