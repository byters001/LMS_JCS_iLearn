// Frontend-side types for the "notifications" feature (own copy, not shared with
// the backend's *.types.ts). Matches the raw `notifications` row shape.
export type NotificationType =
  | 'assessment_published'
  | 'retake_request_approved'
  | 'retake_request_rejected'
  | 'attempt_finalized'

export type NotificationEntityType = 'assessment' | 'attempt' | 'retake_request'

export interface Notification {
  id: string
  recipientId: string
  type: NotificationType
  title: string
  body: string
  relatedEntityType: NotificationEntityType
  relatedEntityId: string
  isRead: boolean
  readAt: string | null
  createdAt: string
}

// Matches backend/src/modules/notifications/notifications.schema.ts's
// listNotificationsQuerySchema exactly — confirmed by reading the real
// schema: isRead/page/pageSize only, no type/entity filter. Self-scoped —
// there is no recipientId param at all; GET /notifications is gated by
// fastify.authenticate only (no permission key), and the backend resolves
// "this caller's own rows" from the JWT, same precedent as reports'
// listMyAttempts.
export interface ListNotificationsParams {
  isRead?: boolean
  page?: number
  pageSize?: number
}

export interface ListNotificationsResponse {
  items: Notification[]
  total: number
  page: number
  pageSize: number
}
