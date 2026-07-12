import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeAny } from 'zod';
import { ValidationError } from '../../shared/errors/app-error';
import { notificationsController } from './notifications.controller';
import {
  listNotificationsQuerySchema,
  notificationIdParamsSchema,
  type ListNotificationsQuery,
  type NotificationIdParams,
} from './notifications.schema';

function validateQuery(schema: ZodTypeAny) {
  return async (request: FastifyRequest): Promise<void> => {
    const parsed = schema.safeParse(request.query);
    if (!parsed.success) {
      throw new ValidationError('Invalid query parameters', parsed.error.flatten());
    }
    request.query = parsed.data;
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

// --- Permission model (item 5) ---
// No requirePermission() here, deliberately — same precedent as
// reports.routes.ts. Both routes are gated by fastify.authenticate ONLY (a
// valid JWT); authorization is self-ownership (this row's recipient_id is
// the caller), enforced in notifications.service.ts. No create endpoint —
// rows only get created internally by the trigger points wired into
// assessments.service.ts / attempts.service.ts.
export async function notificationsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Querystring: ListNotificationsQuery }>(
    '/notifications',
    {
      preHandler: [fastify.authenticate],
      preValidation: validateQuery(listNotificationsQuerySchema),
    },
    notificationsController.listMyNotifications,
  );

  fastify.patch<{ Params: NotificationIdParams }>(
    '/notifications/:id/read',
    {
      preHandler: [fastify.authenticate],
      preValidation: validateParams(notificationIdParamsSchema),
    },
    notificationsController.markNotificationRead,
  );
}

export default notificationsRoutes;
