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
      <header className="border-b border-border bg-background px-6 py-3">
        <div className="flex items-center justify-between">
          <nav className="flex gap-4">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  cn(
                    'text-sm font-medium transition-colors',
                    isActive
                      ? 'text-brand-accent'
                      : 'text-muted-foreground hover:text-brand-primary',
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
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
