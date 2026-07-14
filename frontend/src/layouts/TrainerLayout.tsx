import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { UserMenu } from '@/components/UserMenu'
import { useLogout } from '@/features/auth/api'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'

// Backend role slug for this layout is 'faculty' (see routes/roles.ts).
// "Assessments" added alongside the existing "Students" link — first real
// nav here, mirroring StudentLayout.tsx's pattern exactly. No p-6 wrapper
// around <Outlet /> (each page owns its own padding, same convention
// StudentLayout already uses) — the previous placeholder version had one,
// which double-padded every page under it (StudentListPage/
// AssessmentListPage both already wrap themselves in p-6).
const NAV_LINKS = [
  { to: '/trainer', label: 'Students', end: true },
  { to: '/trainer/assessments', label: 'Assessments', end: true },
  { to: '/trainer/questions', label: 'Questions', end: true },
  { to: '/trainer/analytics', label: 'Analytics', end: true },
]

function TrainerLayout() {
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

export default TrainerLayout
