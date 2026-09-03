import { ClipboardList, History, LayoutDashboard, LineChart, Trophy } from 'lucide-react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ThemeToggle } from '@/components/ThemeToggle'
import { UserAvatarMenu } from '@/components/UserAvatarMenu'
import { useLogout } from '@/features/auth/api'
import { NotificationBell } from '@/features/notifications/components/NotificationBell'
import { StudentRail, type StudentRailNavItem } from '@/layouts/components/StudentRail'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'

// Student Dashboard phase — Dashboard is now the /student index (was
// StudentAssessmentsPage directly); "Your Assessments" moved to its own
// /student/assessments route/nav item, same functionality, unchanged
// internals, just no longer the landing page. Dashboard-first ordering
// mirrors TrainerLayout's own nav reorder (Analytics -> Dashboard, moved
// first).
//
// 4-page nav phase (earlier) — Leaderboard/Performance added below Attempt
// History, in that order. Both were previously embedded as sections on
// "Your Assessments" (StudentAssessmentsPage.tsx) rather than having their
// own nav entry/route — see LeaderboardPage.tsx/PerformancePage.tsx's own
// comments for exactly where they moved from.
//
// Parchment & Emerald phase — the shared hover-to-expand Sidebar (used by
// Admin/Trainer) is replaced here with StudentRail: a permanently icon-only
// rail, per the approved hybrid-nav brief ("all primary nav in the rail,
// icons only, tooltips on hover"). All of it is primary nav, so nothing
// moved to the top bar's link slot — the top bar instead carries identity/
// context chrome (page title, notifications, account).
const NAV_ITEMS: StudentRailNavItem[] = [
  { to: '/student', label: 'Dashboard', end: true, icon: LayoutDashboard },
  { to: '/student/assessments', label: 'Your Assessments', end: true, icon: ClipboardList },
  { to: '/student/attempts', label: 'Attempt History', end: true, icon: History },
  { to: '/student/leaderboard', label: 'Leaderboard', end: true, icon: Trophy },
  { to: '/student/performance', label: 'Performance', end: true, icon: LineChart },
]

// Longest-`to`-first so a sub-route (e.g. /student/assessments/:id) resolves
// to "Your Assessments", not "Dashboard" — every item's `to` is technically
// a startsWith-prefix of every deeper route since they all share the
// /student root.
const TITLE_LOOKUP = [...NAV_ITEMS].sort((a, b) => b.to.length - a.to.length)

function useActivePageTitle(): string {
  const { pathname } = useLocation()
  const match = TITLE_LOOKUP.find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`))
  return match?.label ?? 'Dashboard'
}

function StudentLayout() {
  const user = useAuthStore((state) => state.user)
  const navigate = useNavigate()
  const logout = useLogout()
  const pageTitle = useActivePageTitle()
  const theme = useUIStore((state) => state.theme)

  function handleLogout() {
    logout.mutate(undefined, { onSuccess: () => navigate('/login', { replace: true }) })
  }

  return (
    <div className={cn('app-shell flex min-h-screen bg-background text-foreground', theme === 'dark' && 'dark')}>
      <StudentRail navItems={NAV_ITEMS} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* No search box in this top bar: the confirmed search scope
            (Students/Assessments/Questions/Pools list endpoints) is
            entirely staff-facing, and this phase is visual/structural only
            — wiring a new student-facing search would mean new
            data-fetching, which is out of scope here. See
            AdminLayout/TrainerLayout for the search shell. */}
        {/* print:hidden — Report page "Download PDF" phase; this header has
            no reason to appear in a printed page. */}
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/95 px-4 shadow-sm backdrop-blur supports-backdrop-filter:bg-background/80 print:hidden">
          <h1 className="truncate font-heading text-base font-semibold text-foreground">{pageTitle}</h1>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <NotificationBell />
            <UserAvatarMenu
              name={user?.fullName ?? ''}
              email={user?.email ?? ''}
              onLogout={handleLogout}
              isLoggingOut={logout.isPending}
            />
          </div>
        </header>
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default StudentLayout
