import { ClipboardList, History, LineChart, Trophy } from 'lucide-react'
import { Outlet, useNavigate } from 'react-router-dom'
import { useLogout } from '@/features/auth/api'
import { NotificationBell } from '@/features/notifications/components/NotificationBell'
import { Sidebar, type SidebarNavItem } from '@/layouts/components/Sidebar'
import { useAuthStore } from '@/store/authStore'

// 4-page nav phase — Leaderboard/Performance added below Attempt History,
// in that order (was 2 links, now 4). Both were previously embedded as
// sections on "Your Assessments" (StudentAssessmentsPage.tsx) rather than
// having their own nav entry/route — see LeaderboardPage.tsx/
// PerformancePage.tsx's own comments for exactly where they moved from.
const NAV_ITEMS: SidebarNavItem[] = [
  { type: 'link', to: '/student', label: 'Your Assessments', end: true, icon: ClipboardList },
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
      <Sidebar navItems={NAV_ITEMS} user={user} onLogout={handleLogout} isLoggingOut={logout.isPending} />

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
