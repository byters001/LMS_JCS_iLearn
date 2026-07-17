import { ClipboardList, History } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import logo from '@/assets/brand/logo.jpeg'
import { UserMenu } from '@/components/UserMenu'
import { useLogout } from '@/features/auth/api'
import { NotificationBell } from '@/features/notifications/components/NotificationBell'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'

// Adds a link to the attempt-history view (features/reports).
const NAV_LINKS = [
  { to: '/student', label: 'Your Assessments', end: true, icon: ClipboardList },
  { to: '/student/attempts', label: 'Attempt History', end: true, icon: History },
]

function StudentLayout() {
  const user = useAuthStore((state) => state.user)
  const navigate = useNavigate()
  const logout = useLogout()
  const firstName = user?.fullName?.split(' ')[0]

  function handleLogout() {
    logout.mutate(undefined, { onSuccess: () => navigate('/login', { replace: true }) })
  }

  return (
    <div className="flex min-h-screen">
      {/* Fixed left sidebar — same shell as Admin/Trainer, for consistency,
          even though this role only has 2 nav links. */}
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="flex h-16 shrink-0 items-center border-b border-sidebar-border px-4">
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
                  'flex items-center gap-2.5 rounded-md border-l-4 px-3 py-2 font-heading text-sm font-medium tracking-tight transition-colors',
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
            greeting now lives (see UserMenu.tsx's `greeting` prop and
            AdminLayout.tsx's comment for the full reasoning). */}
        <div className="shrink-0 border-t border-sidebar-border p-4">
          <UserMenu
            name={user?.fullName ?? ''}
            email={user?.email ?? ''}
            onLogout={handleLogout}
            isLoggingOut={logout.isPending}
            greeting={firstName ? `Welcome back, ${firstName}` : undefined}
          />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center justify-end gap-4 border-b border-border bg-background/95 px-6 shadow-sm backdrop-blur supports-backdrop-filter:bg-background/80">
          {/* No global search shell here — the confirmed search scope
              (Students/Assessments/Questions/Pools list endpoints) is
              entirely staff-facing; a student has no reason to search other
              students' profiles or the question bank. See
              AdminLayout/TrainerLayout for the search shell. */}
          <NotificationBell />
        </header>
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default StudentLayout
