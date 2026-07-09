import { buildApp } from './app';
import { env } from './config/env';
import { closeDatabase } from './db/client';
import { logger } from './logger';
import { disconnectRedis } from './redis/client';

// Bound on "drain in-flight requests": app.close() below stops Fastify from
// accepting new connections and waits for in-flight requests to finish
// naturally, but that wait is otherwise unbounded — a single stuck request
// would hang shutdown forever. 10s is a common, conservative default for an
// HTTP API's own drain budget, sized to sit comfortably inside typical
// orchestrator grace periods (e.g. Kubernetes' default
// terminationGracePeriodSeconds is 30s) so there's headroom left for the
// forced exit below plus the process actually tearing down, rather than the
// orchestrator SIGKILLing us mid-cleanup.
const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main(): Promise<void> {
  const app = await buildApp();

  let shuttingDown = false;

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    logger.info({ signal }, 'Shutdown signal received, draining in-flight requests');

    const forceExitTimer = setTimeout(() => {
      logger.error({ timeoutMs: SHUTDOWN_TIMEOUT_MS }, 'Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExitTimer.unref();

    try {
      // Stops accepting new connections, waits for in-flight requests to
      // complete. Only once that's done do we close DB/Redis — closing them
      // earlier could break requests that are still mid-flight.
      await app.close();
      await Promise.all([closeDatabase(), disconnectRedis()]);

      clearTimeout(forceExitTimer);
      logger.info('Shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
      clearTimeout(forceExitTimer);
      process.exit(1);
    }
  }

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  try {
    // host: '0.0.0.0' — Fastify's own default (127.0.0.1) is only reachable
    // from inside the same machine/container, which isn't useful once this
    // runs anywhere other than a bare local process.
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
  } catch (err) {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

void main();
