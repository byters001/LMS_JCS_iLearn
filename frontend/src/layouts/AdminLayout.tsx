import { BarChart3, BookOpen, Building2, ClipboardList, HelpCircle, Layers, Library, Presentation, UserCog, Users } from 'lucide-react'
import { Outlet, useNavigate } from 'react-router-dom'
import { UserAvatarMenu } from '@/components/UserAvatarMenu'
import { useLogout } from '@/features/auth/api'
import { ChatbotWidget } from '@/features/chatbot/components/ChatbotWidget'
import { NotificationBell } from '@/features/notifications/components/NotificationBell'
import { GlobalSearch } from '@/features/search/components/GlobalSearch'
import { Sidebar, type SidebarNavItem } from '@/layouts/components/Sidebar'
import { useAuthStore } from '@/store/authStore'

// super_admin holds question_pools.manage/manage_global (granted directly —
// see backend/drizzle/migrations/0009_add-question-pools-permissions.sql),
// so Pools is nested here alongside Questions under one "Question Bank"
// group — confirmed against routes/index.tsx that both /admin/questions and
// /admin/pools are real, already-built routes, not placeholders.
const NAV_ITEMS: SidebarNavItem[] = [
  { type: 'link', to: '/admin', label: 'Students', end: true, icon: Users },
  // Item 10 tier 1 — platform structure (colleges + their departments, the
  // latter reached via a Tab inside CollegeListPage itself, not a second
  // nav item). Super-Admin-only by the route's own RequireRole placement,
  // matching every other item in this list.
  { type: 'link', to: '/admin/colleges', label: 'Colleges', end: true, icon: Building2 },
  { type: 'link', to: '/admin/batches', label: 'Batches', end: true, icon: BookOpen },
  { type: 'link', to: '/admin/faculty', label: 'Faculty', end: true, icon: UserCog },
  // Phase 5, Super-Admin-only (brief §3.7) — which trainer works in which
  // college/department/batch, plus performance trends. Presentation (not
  // UserCog again): UserCog is already Faculty's own icon two rows up, and
  // this is conceptually a different surface (assignment/performance
  // overview, not account management) even though both are about the same
  // underlying faculty users.
  { type: 'link', to: '/admin/trainers', label: 'Trainers', end: true, icon: Presentation },
  {
    type: 'group',
    label: 'Question Bank',
    icon: Library,
    children: [
      { to: '/admin/questions', label: 'Questions', end: true, icon: HelpCircle },
      { to: '/admin/pools', label: 'Pools', end: true, icon: Layers },
    ],
  },
  { type: 'link', to: '/admin/assessments', label: 'Assessments', end: true, icon: ClipboardList },
  { type: 'link', to: '/admin/analytics', label: 'Analytics', end: true, icon: BarChart3 },
]

function AdminLayout() {
  const user = useAuthStore((state) => state.user)
  const navigate = useNavigate()
  const logout = useLogout()

  function handleLogout() {
    logout.mutate(undefined, { onSuccess: () => navigate('/login', { replace: true }) })
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar navItems={NAV_ITEMS} />

      {/* min-w-0 is load-bearing here: without it, this flex child refuses
          to shrink below its content's intrinsic width (a common flexbox
          gotcha), which would let the search input push the column wider
          than the viewport instead of wrapping/scrolling within it. */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* justify-between (not justify-end): search now lives at the LEFT
            edge, notification bell + account avatar at the right — the
            avatar replaces the old sidebar bottom-block avatar/logout
            entirely (see Sidebar.tsx's own comment). */}
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-background/95 px-6 shadow-sm backdrop-blur supports-backdrop-filter:bg-background/80">
          {/* Item 5a — was a bare, unwired <Input> (no value/onChange/
              onSubmit at all — confirmed a pure visual shell before this
              fix). GlobalSearch owns its own icon/input/dropdown now. */}
          <GlobalSearch basePath="/admin" />
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

      {/* Floating, role-gated internally (super_admin/faculty only) — see
          ChatbotWidget's own comment. Mounted here (not StudentLayout) as
          the structural half of that gate; the component's own role check
          is defense-in-depth on top of it. */}
      <ChatbotWidget />
    </div>
  )
}

export default AdminLayout
