import { LogOut } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface UserAvatarMenuProps {
  name: string
  email: string
  onLogout: () => void
  isLoggingOut: boolean
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0] + parts[parts.length - 1]![0]).toUpperCase()
}

// Shared (not feature-specific) — every layout needs it, so it lives here
// rather than under a features/* folder, same boundary reasoning as this
// file's predecessor (see git history / NotificationBell.tsx's own comment
// on the shared-vs-feature split). Logout itself still isn't called from
// here: each layout owns the useLogout() mutation and hands down a plain
// onLogout callback, matching CLAUDE1.md's "feature data comes in as
// props" rule for shared/components/.
//
// Lives in the top bar now, top-right next to NotificationBell — replaces
// the old sidebar bottom-block avatar/logout entirely (see Sidebar.tsx:
// that block is gone, not just relocated, since keeping a second avatar
// there once this one exists would just be redundant chrome for the same
// action). Click-outside-dismiss reuses the exact same
// ref+mousedown-listener pattern NotificationBell.tsx already established,
// not a new abstraction for a pattern used in exactly two places.
export function UserAvatarMenu({ name, email, onLogout, isLoggingOut }: UserAvatarMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Account menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className="flex size-8 items-center justify-center rounded-full bg-brand-primary text-xs font-semibold text-white transition-opacity hover:opacity-90"
      >
        {getInitials(name)}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-20 mt-2 w-64 rounded-lg border border-border bg-background shadow-lg">
          <div className="border-b border-border px-4 py-3">
            <p className="truncate font-heading text-sm font-medium text-brand-primary">{name}</p>
            <p className="truncate text-xs text-muted-foreground">{email}</p>
          </div>
          <button
            type="button"
            disabled={isLoggingOut}
            onClick={() => {
              setIsOpen(false)
              onLogout()
            }}
            className={cn(
              'flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-destructive transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50',
            )}
          >
            <LogOut className="size-4 shrink-0" />
            {isLoggingOut ? 'Logging out…' : 'Logout'}
          </button>
        </div>
      )}
    </div>
  )
}
