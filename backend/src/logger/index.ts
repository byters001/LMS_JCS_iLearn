import pino from 'pino';
import { env } from '../config/env';

const isProduction = env.NODE_ENV === 'production';

export const logger = pino({
  level: env.LOG_LEVEL,
  serializers: {
    err: pino.stdSerializers.err,
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.passwordHash',
      '*.password_hash',
      '*.token',
      '*.accessToken',
      '*.refreshToken',
      '*.secret',
      '*.apiKey',
      '*.SUPABASE_SERVICE_ROLE_KEY',
      '*.JWT_SECRET',
      '*.JWT_REFRESH_SECRET',
    ],
    censor: '[REDACTED]',
  },
  transport: isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
});

export type Logger = typeof logger;
