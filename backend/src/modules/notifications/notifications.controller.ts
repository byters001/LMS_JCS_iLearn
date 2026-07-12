import type { FastifyReply, FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../../shared/errors/app-error';
import type { ApiSuccessResponse } from '../../shared/types/api-response';
import { notificationsService } from './notifications.service';
import type { ListNotificationsQuery, NotificationIdParams } from './notifications.schema';

function requireUserId(request: FastifyRequest): string {
  if (!request.user) {
    throw new UnauthorizedError('Authentication required');
  }
  return request.user.id;
}

async function listMyNotifications(
  request: FastifyRequest<{ Querystring: ListNotificationsQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = requireUserId(request);
  const result = await notificationsService.listMyNotifications(userId, request.query);
  const response: ApiSuccessResponse<typeof result> = { success: true, data: result };
  reply.status(200).send(response);
}

async function markNotificationRead(
  request: FastifyRequest<{ Params: NotificationIdParams }>,
  reply: FastifyReply,
): Promise<void> {
  const userId = requireUserId(request);
  const notification = await notificationsService.markNotificationRead(
    userId,
    request.params.id,
  );
  const response: ApiSuccessResponse<typeof notification> = { success: true, data: notification };
  reply.status(200).send(response);
}

export const notificationsController = {
  listMyNotifications,
  markNotificationRead,
};
