import type { Notification } from '../../db/types';

export type { Notification };

export interface ListNotificationsResult {
  items: Notification[];
  total: number;
  page: number;
  pageSize: number;
}
