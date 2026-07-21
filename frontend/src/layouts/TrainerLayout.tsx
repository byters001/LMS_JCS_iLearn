import { BarChart3, ClipboardList, HelpCircle, Layers } from 'lucide-react'
import { Outlet, useNavigate } from 'react-router-dom'
import { useLogout } from '@/features/auth/api'
import { ChatbotWidget } from '@/features/chatbot/components/ChatbotWidget'
import { NotificationBell } from '@/features/notifications/components/NotificationBell'
import { GlobalSearch } from '@/features/search/components/GlobalSearch'
import { Sidebar, type SidebarNavItem } from '@/layouts/components/Sidebar'
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
//
// Also NOT included (fix-doc item 6): a standalone "Students" link. It used
// to point at StudentListPage's college-wise browser, which 403s for
// Faculty — that page's college grid is backed by GET /colleges, gated by a
// permission only super_admin holds, so Faculty always hit "Failed to load
// colleges" (confirmed against colleges.view in
// backend/drizzle/reference/schema.sql's role_permissions seed). Faculty
// don't manage colleges at all — their students are reachable through the
// batches they're actually assigned to, so student browsing now lives as a
// per-batch drill-down on My Batches (see MyBatchesPage.tsx) instead of a
// separate nav item.
const NAV_ITEMS: SidebarNavItem[] = [
  { type: 'link', to: '/trainer/batches', label: 'My Batches', end: true, icon: Layers },
  { type: 'link', to: '/trainer/questions', label: 'Questions', end: true, icon: HelpCircle },
  { type: 'link', to: '/trainer/assessments', label: 'Assessments', end: true, icon: ClipboardList },
  { type: 'link', to: '/trainer/analytics', label: 'Analytics', end: true, icon: BarChart3 },
]

function TrainerLayout() {
  const user = useAuthStore((state) => state.user)
  const navigate = useNavigate()
  const logout = useLogout()

  function handleLogout() {
    logout.mutate(undefined, { onSuccess: () => navigate('/login', { replace: true }) })
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar navItems={NAV_ITEMS} user={user} onLogout={handleLogout} isLoggingOut={logout.isPending} />

      {/* min-w-0 is load-bearing here: without it, this flex child refuses
          to shrink below its content's intrinsic width (a common flexbox
          gotcha), which would let the search input push the column wider
          than the viewport instead of wrapping/scrolling within it. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center justify-end gap-4 border-b border-border bg-background/95 px-6 shadow-sm backdrop-blur supports-backdrop-filter:bg-background/80">
          {/* Item 5a — was a bare, unwired <Input>, same dead shell as
              AdminLayout.tsx's copy (see that file's comment). Pool results
              will simply never appear here — GET /question-pools 403s for
              Faculty (see this file's own module comment above on why Pools
              isn't in the nav either) — GlobalSearch degrades that
              per-category rather than erroring the whole widget. */}
          <GlobalSearch basePath="/trainer" />
          <NotificationBell />
        </header>
        <main className="flex-1">
          <Outlet />
        </main>
      </div>

      {/* Floating, role-gated internally (super_admin/faculty only) — see
          ChatbotWidget's own comment. Mounted here (not StudentLayout) as
          the structural half of that gate; the component's own role check
          is defense-in-depth on top of it. */}
      <ChatbotWidget />
    </div>
  )
}

export default TrainerLayout
