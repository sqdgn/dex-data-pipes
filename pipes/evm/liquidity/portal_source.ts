import { evmPortalSource } from '@subsquid/pipes/evm';
import { metricsServer } from '@subsquid/pipes/metrics/node';
import { portalSqliteCache } from '@subsquid/pipes/portal-cache/node';

export const createPortalSource = async (
  portal: string,
  portalCacheDbPath: string,
  metricsPort: number,
) =>
  evmPortalSource({
    portal,
    metrics: metricsPort
      ? metricsServer({
          port: metricsPort,
        })
      : undefined,
    cache: portalSqliteCache({
      path: portalCacheDbPath,
    }),
  });
