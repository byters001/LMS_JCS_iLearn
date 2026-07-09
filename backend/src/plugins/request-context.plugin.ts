import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { requestIdMiddleware } from '../middleware/request-id.middleware';

export default fp(async function requestContextPlugin(fastify: FastifyInstance) {
  fastify.addHook('onRequest', requestIdMiddleware);
});
