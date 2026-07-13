import { Button } from '@/components/ui/button'

interface UserMenuProps {
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
// rather than under a features/* folder. Deliberately presentational only:
// CLAUDE1.md's boundary rules say shared components/ never imports from a
// specific features/* folder, but the actual logout call lives in
// features/auth/api.ts's useLogout — so each layout owns that mutation and
// hands this component a plain onLogout callback + isLoggingOut flag,
// exactly the "feature-specific data comes in as props" pattern the same
// rule prescribes.
export function UserMenu({ name, email, onLogout, isLoggingOut }: UserMenuProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-primary text-xs font-semibold text-white">
        {getInitials(name)}
      </div>
      <div className="hidden text-right sm:block">
        <p className="text-sm font-medium text-brand-primary">{name}</p>
        <p className="text-xs text-muted-foreground">{email}</p>
      </div>
      <Button variant="outline" size="sm" disabled={isLoggingOut} onClick={onLogout}>
        {isLoggingOut ? 'Logging out…' : 'Logout'}
      </Button>
    </div>
  )
}
