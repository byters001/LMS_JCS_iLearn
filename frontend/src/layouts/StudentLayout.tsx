import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { UserMenu } from '@/components/UserMenu'
import { useLogout } from '@/features/auth/api'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'

// First real navigation in this shell — previously just a placeholder
// header with no way to reach anything beyond the assessments list
// (StudentAssessmentsPage was only reachable via the index route itself).
// Adds a link to the new attempt-history view (features/reports).
const NAV_LINKS = [
  { to: '/student', label: 'Your Assessments', end: true },
  { to: '/student/attempts', label: 'Attempt History', end: true },
]

function StudentLayout() {
  const user = useAuthStore((state) => state.user)
  const navigate = useNavigate()
  const logout = useLogout()

  function handleLogout() {
    logout.mutate(undefined, { onSuccess: () => navigate('/login', { replace: true }) })
  }

  return (
    <div>
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-6 py-4 shadow-sm backdrop-blur supports-backdrop-filter:bg-background/80">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-8">
            <span className="text-base font-semibold tracking-tight text-brand-primary">
              JCS iLearn
            </span>
            <nav className="flex gap-1">
              {NAV_LINKS.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) =>
                    cn(
                      'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-brand-accent/10 text-brand-accent'
                        : 'text-muted-foreground hover:bg-muted hover:text-brand-primary',
                    )
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <UserMenu
            name={user?.fullName ?? ''}
            email={user?.email ?? ''}
            onLogout={handleLogout}
            isLoggingOut={logout.isPending}
          />
        </div>
      </header>
      <Outlet />
    </div>
  )
}

export default StudentLayout
