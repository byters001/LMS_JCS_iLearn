import Redis from 'ioredis';
import { env } from '../config/env';
import { logger } from '../logger';

const MAX_RETRIES_PER_REQUEST = 3;
const BASE_RETRY_DELAY_MS = 200;
const MAX_RETRY_DELAY_MS = 10_000;

// Exponential backoff, capped at MAX_RETRY_DELAY_MS, retried forever — never
// returns null/undefined, so ioredis keeps trying indefinitely instead of
// giving up on the connection after a burst of failures.
function retryStrategy(attempt: number): number {
  return Math.min(BASE_RETRY_DELAY_MS * 2 ** attempt, MAX_RETRY_DELAY_MS);
}

// env.REDIS_URL is validated to start with rediss:// (config/env.ts) — that
// scheme alone tells ioredis to negotiate TLS, which is required by Upstash.
export const redisClient = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: MAX_RETRIES_PER_REQUEST,
  retryStrategy,
});

// Registering this is required, not just nice-to-have: an 'error' event with
// no listener crashes the Node process. This keeps a transient connection
// drop (Upstash idle timeout, network blip, etc.) from taking the server down.
redisClient.on('error', (err) => {
  logger.error({ err }, 'Redis client error');
});

redisClient.on('connect', () => {
  logger.info('Redis client connected');
});

redisClient.on('reconnecting', (delay: number) => {
  logger.warn({ delay }, 'Redis client reconnecting');
});

export async function ping(): Promise<boolean> {
  try {
    const reply = await redisClient.ping();
    return reply === 'PONG';
  } catch (err) {
    logger.error({ err }, 'Redis ping failed');
    return false;
  }
}

// For server.ts's graceful shutdown (CLAUDE.md non-negotiable #5: drain and
// close the Redis connection before exiting, no hard kills on deploy/restart).
export async function disconnectRedis(): Promise<void> {
  await redisClient.quit();
}
