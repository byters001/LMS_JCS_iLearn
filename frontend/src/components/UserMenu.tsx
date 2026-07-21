import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface UserMenuProps {
  name: string
  email: string
  onLogout: () => void
  isLoggingOut: boolean
  // Optional "Welcome back, X" line — lives here now instead of the top bar
  // (see layouts/*.tsx's sidebar user-block comment for why: consolidating
  // it here means nothing in the top bar depends on the user's name length).
  greeting?: string
  // Icon-rail mode for the collapsible sidebar (see layouts/components/
  // Sidebar.tsx) — avatar + a bare logout icon button, no name/email text
  // (there's no room for it at that width, and it's one click away via
  // expanding the sidebar anyway).
  collapsed?: boolean
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0] + parts[parts.length - 1]![0]).toUpperCase()
}

// Shared (not feature-specific) — every layout needs it, so it lives here
// rather than under a features/* folder. Deliberately presentational only:
// CLAUDE1.md's boundary rules say shared components/ never imports from a
// specific features/* folder, but the actual logout call lives in
// features/auth/api.ts's useLogout — so each layout owns that mutation and
// hands this component a plain onLogout callback + isLoggingOut flag,
// exactly the "feature-specific data comes in as props" pattern the same
// rule prescribes.
//
// Stacked (not horizontal-row) layout: this now renders in the sidebar's
// fixed-width bottom block (~240px), not a wide top-bar row, so avatar +
// name/email + logout need to fit a narrow column instead of a single line.
// `truncate` + the parent's `min-w-0` are the actual fix for the "long name
// wraps across 3 lines" bug — a fixed max-width alone would still let an
// unusually long name overflow; truncate forces single-line + ellipsis
// regardless of how long the name is.
export function UserMenu({ name, email, onLogout, isLoggingOut, greeting, collapsed = false }: UserMenuProps) {
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2">
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-primary text-xs font-semibold text-white"
          title={email ? `${name} · ${email}` : name}
        >
          {getInitials(name)}
        </div>
        <Button
          variant="ghost"
          size="icon"
          disabled={isLoggingOut}
          onClick={onLogout}
          title={isLoggingOut ? 'Logging out…' : 'Logout'}
          aria-label={isLoggingOut ? 'Logging out…' : 'Logout'}
        >
          <LogOut className="size-4" />
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {greeting && <p className="truncate text-xs font-medium text-muted-foreground">{greeting}</p>}
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-primary text-xs font-semibold text-white">
          {getInitials(name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-heading text-sm font-medium text-brand-primary">{name}</p>
          <p className="truncate text-xs text-muted-foreground">{email}</p>
        </div>
      </div>
      <Button variant="outline" size="sm" disabled={isLoggingOut} onClick={onLogout} className="w-full">
        {isLoggingOut ? 'Logging out…' : 'Logout'}
      </Button>
    </div>
  )
}
