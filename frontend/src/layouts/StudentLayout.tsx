import { NavLink, Outlet } from 'react-router-dom'
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

  return (
    <div>
      <header className="border-b border-border bg-background px-6 py-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-brand-primary">
            Logged in as: {user?.fullName} (student)
          </p>
        </div>
        <nav className="mt-2 flex gap-4">
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
      </header>
      <Outlet />
    </div>
  )
}

export default StudentLayout
