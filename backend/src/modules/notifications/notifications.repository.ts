import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { notifications } from '../../db/schema/notifications.schema';
import type { NewNotification, Notification } from '../../db/types';

export interface ListNotificationsParams {
  recipientId: string;
  isRead?: boolean;
  page: number;
  pageSize: number;
}

export interface ListNotificationsResult {
  items: Notification[];
  total: number;
}

function buildWhere(recipientId: string, isRead?: boolean) {
  const conditions = [eq(notifications.recipientId, recipientId)];
  if (isRead !== undefined) conditions.push(eq(notifications.isRead, isRead));
  return and(...conditions);
}

async function listNotifications(
  params: ListNotificationsParams,
): Promise<ListNotificationsResult> {
  const { recipientId, isRead, page, pageSize } = params;
  const offset = (page - 1) * pageSize;
  const where = buildWhere(recipientId, isRead);

  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(where)
      .orderBy(desc(notifications.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(notifications).where(where),
  ]);

  return { items, total: Number(totalRows[0]?.count ?? 0) };
}

async function findNotificationById(id: string): Promise<Notification | undefined> {
  const [row] = await db.select().from(notifications).where(eq(notifications.id, id)).limit(1);
  return row;
}

async function markAsRead(id: string): Promise<Notification | undefined> {
  const [row] = await db
    .update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(eq(notifications.id, id))
    .returning();
  return row;
}

// Bulk insert — notifyAssessmentPublished can fan out to every student
// across every authorized batch in one publish event, so a single
// multi-row INSERT beats N round trips. Empty input short-circuits rather
// than issuing a no-op INSERT (Drizzle rejects `.values([])` outright).
async function createNotifications(data: NewNotification[]): Promise<Notification[]> {
  if (data.length === 0) {
    return [];
  }
  return db.insert(notifications).values(data).returning();
}

export const notificationsRepository = {
  listNotifications,
  findNotificationById,
  markAsRead,
  createNotifications,
};
