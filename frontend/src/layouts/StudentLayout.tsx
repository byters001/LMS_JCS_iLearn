import { ClipboardList, History, LayoutDashboard, LineChart, Trophy } from 'lucide-react'
import { Outlet, useNavigate } from 'react-router-dom'
import { UserAvatarMenu } from '@/components/UserAvatarMenu'
import { useLogout } from '@/features/auth/api'
import { NotificationBell } from '@/features/notifications/components/NotificationBell'
import { Sidebar, type SidebarNavItem } from '@/layouts/components/Sidebar'
import { useAuthStore } from '@/store/authStore'

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
const NAV_ITEMS: SidebarNavItem[] = [
  { type: 'link', to: '/student', label: 'Dashboard', end: true, icon: LayoutDashboard },
  { type: 'link', to: '/student/assessments', label: 'Your Assessments', end: true, icon: ClipboardList },
  { type: 'link', to: '/student/attempts', label: 'Attempt History', end: true, icon: History },
  { type: 'link', to: '/student/leaderboard', label: 'Leaderboard', end: true, icon: Trophy },
  { type: 'link', to: '/student/performance', label: 'Performance', end: true, icon: LineChart },
]

function StudentLayout() {
  const user = useAuthStore((state) => state.user)
  const navigate = useNavigate()
  const logout = useLogout()

  function handleLogout() {
    logout.mutate(undefined, { onSuccess: () => navigate('/login', { replace: true }) })
  }

  return (
    <div className="flex min-h-screen">
      {/* Same shared Sidebar as Admin/Trainer, for consistency. */}
      <Sidebar navItems={NAV_ITEMS} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* justify-between + an empty left spacer: no GlobalSearch here (see
            comment below), but keeping the same left/right split as Admin/
            Trainer's header means the notification bell + account avatar
            still land at the right edge instead of drifting to justify-end's
            single-child left-start behavior. */}
        {/* print:hidden — Report page "Download PDF" phase; this header has
            no reason to appear in a printed page. */}
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-background/95 px-6 shadow-sm backdrop-blur supports-backdrop-filter:bg-background/80 print:hidden">
          {/* No global search shell here — the confirmed search scope
              (Students/Assessments/Questions/Pools list endpoints) is
              entirely staff-facing; a student has no reason to search other
              students' profiles or the question bank. See
              AdminLayout/TrainerLayout for the search shell. */}
          <div />
          <div className="flex items-center gap-3">
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
