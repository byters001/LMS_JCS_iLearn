import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeAny } from 'zod';
import { requirePermission } from '../../rbac/require-permission';
import { ValidationError } from '../../shared/errors/app-error';
import { chatbotController } from './chatbot.controller';
import {
  askChatbotSchema,
  chatbotQueryIdParamsSchema,
  type AskChatbotInput,
  type ChatbotQueryIdParams,
} from './chatbot.schema';

function validateBody(schema: ZodTypeAny) {
  return async (request: FastifyRequest): Promise<void> => {
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid request body', parsed.error.flatten());
    }
    request.body = parsed.data;
  };
}

function validateParams(schema: ZodTypeAny) {
  return async (request: FastifyRequest): Promise<void> => {
    const parsed = schema.safeParse(request.params);
    if (!parsed.success) {
      throw new ValidationError('Invalid route parameters', parsed.error.flatten());
    }
    request.params = parsed.data;
  };
}

// 'chatbot.query' — a NEW permission key, seeded to BOTH super_admin and
// faculty explicitly via a --custom migration (see drizzle/migrations/
// <next>_add-chatbot-permissions.sql), per the task's own "super_admin/
// faculty only, reject others server-side" requirement. Deliberately NOT
// reusing 'analytics.view': that key's established meaning is narrower
// (batch performance analytics specifically — see analytics.routes.ts),
// while this chatbot spans students/trainers/training-sessions data too —
// a distinct key keeps its own scope legible rather than silently
// widening an existing one to cover ground it wasn't originally meant to.
const CHATBOT_QUERY = requirePermission('chatbot.query');

export async function chatbotRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: AskChatbotInput }>(
    '/chatbot/ask',
    {
      preHandler: [fastify.authenticate, CHATBOT_QUERY],
      preValidation: validateBody(askChatbotSchema),
    },
    chatbotController.ask,
  );

  // Item 5 ("Download") backend support — re-fetches and re-validates the
  // resolved function from a past logged question, live, rather than
  // replaying a cached result. See chatbot.service.ts's
  // exportResolvedQueryAsCsv for the full reasoning.
  fastify.get<{ Params: ChatbotQueryIdParams }>(
    '/chatbot/queries/:id/export',
    {
      preHandler: [fastify.authenticate, CHATBOT_QUERY],
      preValidation: validateParams(chatbotQueryIdParamsSchema),
    },
    chatbotController.exportQueryCsv,
  );
}

export default chatbotRoutes;
