import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { env } from '../config/env';

export default fp(async function corsHelmetPlugin(fastify: FastifyInstance) {
  await fastify.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
  });

  await fastify.register(helmet);
});
