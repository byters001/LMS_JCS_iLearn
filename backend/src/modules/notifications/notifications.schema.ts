import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../config/constants';

const paginationFields = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
};

// No create schema — no separate create endpoint exists (item 5). Rows
// only ever get created internally by notifications.service.ts's trigger
// functions, called from other modules' services, never via an HTTP body.
export const listNotificationsQuerySchema = z
  .object({
    isRead: z.coerce.boolean().optional(),
    ...paginationFields,
  })
  .strict();

export const notificationIdParamsSchema = z
  .object({
    id: z.string().uuid('id must be a valid UUID'),
  })
  .strict();

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
export type NotificationIdParams = z.infer<typeof notificationIdParamsSchema>;
