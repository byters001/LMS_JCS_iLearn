import { Bell } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useMarkAsRead, useNotifications } from '../api'
import type { Notification } from '../types'

const RECENT_PAGE_SIZE = 10

// Placement call: this is feature-owned (features/notifications/components/),
// not shared/components/ despite the task's "shared" framing. UserMenu.tsx's
// own comment documents exactly why that boundary exists: CLAUDE1.md says
// shared components/ never imports from a specific features/* folder, so
// every layout instead OWNS its feature hook calls (useLogout) and hands
// UserMenu plain props. Notifications carry real internal state — a list,
// pagination, open/closed, per-item mark-read, a poll interval — that would
// mean re-deriving the same data-fetching in all three layout files if this
// lived in shared/components/ as a purely presentational piece. Keeping it
// self-contained here and importing it directly into each layout (the same
// way layouts already import useLogout from features/auth/api) avoids that
// duplication without breaking the boundary rule, which only restricts
// shared/components/ itself.
function formatRelativeTime(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' })
}

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Two separate queries, not one: the badge needs an accurate TOTAL unread
  // count across every page (from the server's own `total`, filtered
  // isRead=false, pageSize=1 since only the count is needed) — counting
  // unread within just the recent-list's first page would undercount once
  // there are more unread notifications than that page holds.
  const unreadQuery = useNotifications({ isRead: false, page: 1, pageSize: 1 })
  const recentQuery = useNotifications({ page: 1, pageSize: RECENT_PAGE_SIZE })
  const markAsRead = useMarkAsRead()

  const unreadCount = unreadQuery.data?.total ?? 0

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  function handleNotificationClick(notification: Notification) {
    if (!notification.isRead) {
      markAsRead.mutate(notification.id)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className="relative flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-brand-primary"
      >
        <Bell className="size-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-border bg-background shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <p className="text-sm font-semibold text-brand-primary">Notifications</p>
            {unreadCount > 0 && (
              <span className="text-xs text-muted-foreground">{unreadCount} unread</span>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {recentQuery.isPending && (
              <div className="space-y-2 p-3" role="status" aria-label="Loading notifications">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-14 animate-pulse rounded-md bg-muted" />
                ))}
              </div>
            )}

            {recentQuery.isError && (
              <p className="p-4 text-sm text-destructive">Failed to load notifications.</p>
            )}

            {recentQuery.data && recentQuery.data.items.length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">No notifications yet.</p>
            )}

            {recentQuery.data && recentQuery.data.items.length > 0 && (
              <ul className="divide-y divide-border">
                {recentQuery.data.items.map((notification) => (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => handleNotificationClick(notification)}
                      className={cn(
                        'block w-full px-4 py-3 text-left transition-colors hover:bg-muted/50',
                        !notification.isRead && 'bg-brand-accent/5',
                      )}
                    >
                      <div className="flex items-start gap-2">
                        {!notification.isRead && (
                          <span
                            aria-hidden="true"
                            className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-accent"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              'text-sm text-brand-primary',
                              !notification.isRead && 'font-semibold',
                            )}
                          >
                            {notification.title}
                          </p>
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                            {notification.body}
                          </p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {formatRelativeTime(notification.createdAt)}
                          </p>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
