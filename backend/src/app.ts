import fastifyCookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';

// Minimal composition root for now — this phase only needs the Fastify
// instance to exist so @fastify/cookie can be registered (auth.controller.ts
// reads/writes the refresh token cookie via request.cookies/reply.setCookie).
// Wiring the rest of the plugins/routes/modules together is a later,
// dedicated phase per CLAUDE.md's phased build process.
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();

  await app.register(fastifyCookie);

  return app;
}
