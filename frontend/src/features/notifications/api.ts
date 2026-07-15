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

export function useNotifications(params: ListNotificationsParams) {
  return useQuery({
    queryKey: ['notifications', 'list', params],
    queryFn: () => listNotifications(params),
    placeholderData: keepPreviousData,
    refetchInterval: NOTIFICATIONS_POLL_INTERVAL_MS,
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
