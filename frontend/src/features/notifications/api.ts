// TanStack Query hooks for the "notifications" feature, calling the shared api/ client.
// This is the only file in this feature allowed to import from api/.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import type { ListNotificationsParams, ListNotificationsResponse, Notification } from './types'

function listNotifications(
  params: ListNotificationsParams,
): Promise<ListNotificationsResponse> {
  return api.get<ListNotificationsResponse>('/notifications', { params })
}

// Polling, not refetch-on-focus-only: this codebase has no WebSocket/push
// infrastructure (CLAUDE1.md is explicit that Socket.IO isn't included
// until a specific real-time feature needs it), so real-time push is out
// of scope — but a notification bell whose badge only updates when the
// user happens to refocus the tab would miss "a new one arrived while I
// was reading this page" the whole point of a bell is to surface. 30s is
// a light, deliberately non-aggressive interval: frequent enough that a
// just-published assessment or a just-graded attempt shows up within one
// short wait, not so frequent it meaningfully adds load for something
// that isn't latency-sensitive. TanStack Query's own default
// refetchOnWindowFocus/refetchOnMount also still apply on top of this,
// same as every other query hook in this app — nothing disables them.
const NOTIFICATIONS_POLL_INTERVAL_MS = 30_000

// `options.enabled` (item 5b) — NotificationBell.tsx's recentQuery uses
// this to stop polling the full recent-list while its dropdown is closed
// (which is nearly all the time it's mounted): this hook was firing BOTH
// the badge-count query AND the full recent-list query, every 30s, on
// EVERY authenticated page, regardless of whether the dropdown was ever
// opened — confirmed live (see this session's item 5b instrumentation) as
// a real, unnecessary background load contributing to page-load
// contention, not just a theoretical inefficiency. The badge-count query
// (unreadQuery) still passes no options and stays always-on/always-polling
// — it's cheap (pageSize:1) and its count must stay visible without
// opening the dropdown.
export function useNotifications(
  params: ListNotificationsParams,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ['notifications', 'list', params],
    queryFn: () => listNotifications(params),
    placeholderData: keepPreviousData,
    refetchInterval: NOTIFICATIONS_POLL_INTERVAL_MS,
    enabled: options?.enabled,
  })
}

function markAsRead(id: string): Promise<Notification> {
  return api.patch<Notification>(`/notifications/${id}/read`)
}

export function useMarkAsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: markAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', 'list'] })
    },
  })
}
