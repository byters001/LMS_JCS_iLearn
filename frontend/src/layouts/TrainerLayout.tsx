import { BarChart3, ClipboardList, HelpCircle, Search, Users } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import logo from '@/assets/brand/logo.jpeg'
import { UserMenu } from '@/components/UserMenu'
import { Input } from '@/components/ui/input'
import { useLogout } from '@/features/auth/api'
import { NotificationBell } from '@/features/notifications/components/NotificationBell'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'

// Backend role slug for this layout is 'faculty' (see routes/roles.ts).
//
// No "Question Bank" group here despite Admin having one: Pools is
// deliberately omitted (see this task's DECISION — faculty holds neither
// question_pools.manage nor question_pools.manage_global; confirmed
// directly against backend/drizzle/migrations/0009_add-question-pools-
// permissions.sql, which grants both keys to super_admin only). With only
// Questions left, nesting it under a one-item collapsible group would be
// pure UI overhead with nothing to actually group it with — a flat link is
// the honest structure here, not a smaller copy of Admin's group.
//
// Also deliberately NOT included: Trainers. The brief listed 'trainers.view'
// as a permission faculty holds, but that's incorrect — confirmed directly
// against backend/drizzle/migrations/0003_add-trainers-permissions.sql,
// which grants trainers.view/trainers.manage to super_admin only. Moot for
// nav purposes either way since a Trainers *page* doesn't exist yet (later
// phase), but flagging the permission fact since the brief assumed
// otherwise.
const NAV_LINKS = [
  { to: '/trainer', label: 'Students', end: true, icon: Users },
  { to: '/trainer/questions', label: 'Questions', end: true, icon: HelpCircle },
  { to: '/trainer/assessments', label: 'Assessments', end: true, icon: ClipboardList },
  { to: '/trainer/analytics', label: 'Analytics', end: true, icon: BarChart3 },
]

function TrainerLayout() {
  const user = useAuthStore((state) => state.user)
  const navigate = useNavigate()
  const logout = useLogout()
  const firstName = user?.fullName?.split(' ')[0]

  function handleLogout() {
    logout.mutate(undefined, { onSuccess: () => navigate('/login', { replace: true }) })
  }

  return (
    <div className="flex min-h-screen">
      {/* Fixed left sidebar — matches the dark-sidebar/inventory dashboard
          references (logo top, vertical nav, user block pinned to bottom).
          `sticky top-0 h-screen` rather than `fixed` + manual margin on the
          content column: it keeps the sidebar pinned during scroll without
          needing a matching padding-left value kept in sync elsewhere. */}
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-border bg-background">
        <div className="flex h-16 shrink-0 items-center border-b border-border px-4">
          {/* logo.jpeg is a 1600x1600 square canvas with the actual wordmark
              centered in a thin horizontal band (heavy white padding
              top/bottom) — object-cover on a wide/short box crops to just
              that band instead of squashing the whole square down to
              illegible height, without touching the source asset. */}
          <img src={logo} alt="JCS iLearn" className="h-10 w-44 object-cover" />
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-md border-l-4 px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'border-brand-accent bg-brand-accent/10 text-brand-accent'
                    : 'border-transparent text-muted-foreground hover:bg-muted hover:text-brand-primary',
                )
              }
            >
              <link.icon className="size-4 shrink-0" />
              {link.label}
            </NavLink>
          ))}
        </nav>

        {/* User block pinned to the bottom — also where the "Welcome back"
            greeting lives (see UserMenu.tsx's `greeting` prop). */}
        <div className="shrink-0 border-t border-border p-4">
          <UserMenu
            name={user?.fullName ?? ''}
            email={user?.email ?? ''}
            onLogout={handleLogout}
            isLoggingOut={logout.isPending}
            greeting={firstName ? `Welcome back, ${firstName}` : undefined}
          />
        </div>
      </aside>

      {/* min-w-0 is load-bearing here: without it, this flex child refuses
          to shrink below its content's intrinsic width (a common flexbox
          gotcha), which would let the search input push the column wider
          than the viewport instead of wrapping/scrolling within it. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center justify-end gap-4 border-b border-border bg-background/95 px-6 shadow-sm backdrop-blur supports-backdrop-filter:bg-background/80">
          <div className="relative min-w-96">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search students, assessments, questions, pools…"
              className="w-full pl-8"
            />
          </div>
          <NotificationBell />
        </header>
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default TrainerLayout
