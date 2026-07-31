import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeAny } from 'zod';
import { requirePermission } from '../../rbac/require-permission';
import { ValidationError } from '../../shared/errors/app-error';
import { chatbotController } from './chatbot.controller';
import {
  askChatbotSchema,
  chatbotQueryIdParamsSchema,
  listChatbotQueriesQuerySchema,
  type AskChatbotInput,
  type ChatbotQueryIdParams,
  type ListChatbotQueriesQuery,
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

function validateQuery(schema: ZodTypeAny) {
  return async (request: FastifyRequest): Promise<void> => {
    const parsed = schema.safeParse(request.query);
    if (!parsed.success) {
      throw new ValidationError('Invalid query parameters', parsed.error.flatten());
    }
    request.query = parsed.data;
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

// Distinct from CHATBOT_QUERY above — 'chatbot.audit_log' is seeded to
// super_admin ONLY (see the migration adding it), unlike 'chatbot.query'
// (super_admin + faculty). This gates the admin audit-log view, not
// "may ask the chatbot" — see that migration's own comment for why this
// is a separate key rather than widening chatbot.query's existing grant.
const CHATBOT_AUDIT_LOG = requirePermission('chatbot.audit_log');

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

  // Admin audit log (this task) — every logged question, successful or
  // rejected, most-recent-first, real pagination. Super-Admin-only: this
  // is audit/security data (who asked what, including prompt-injection/
  // out-of-scope attempts that got rejected), not a general staff report.
  fastify.get<{ Querystring: ListChatbotQueriesQuery }>(
    '/chatbot/queries',
    {
      preHandler: [fastify.authenticate, CHATBOT_AUDIT_LOG],
      preValidation: validateQuery(listChatbotQueriesQuerySchema),
    },
    chatbotController.listQueries,
  );
}

export default chatbotRoutes;
