import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { env } from '../config/env';

export default fp(async function corsHelmetPlugin(fastify: FastifyInstance) {
  await fastify.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
    // @fastify/cors defaults `methods` to 'GET,HEAD,POST' only (its own
    // source, not a framework-wide REST default) — every PUT/PATCH/DELETE
    // route in this API (e.g. attempts' PUT .../responses/:questionVersionId)
    // was being rejected at the CORS preflight before ever reaching Fastify,
    // from any real browser origin. Explicit here to match the verbs this
    // API actually implements (confirmed via grep across modules/*.routes.ts).
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });

  await fastify.register(helmet);
});
