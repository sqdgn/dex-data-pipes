import { evmPortalSource } from '@subsquid/pipes/evm';
import { metricsServer } from '@subsquid/pipes/metrics/node';
import { portalSqliteCache } from '@subsquid/pipes/portal-cache/node';

export const createPortalSource = async (portal: string, portalCacheDbPath: string) =>
  evmPortalSource({
    portal,
    metrics: metricsServer({
      port: 8888,
    }),
    cache: portalSqliteCache({
      path: portalCacheDbPath,
    }),
  });
