import { BarChart3, BookOpen, Building2, ChevronDown, ClipboardList, HelpCircle, Layers, Library, Presentation, Search, UserCog, Users } from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import logo from '@/assets/brand/logo.jpeg'
import { UserMenu } from '@/components/UserMenu'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { useLogout } from '@/features/auth/api'
import { ChatbotWidget } from '@/features/chatbot/components/ChatbotWidget'
import { NotificationBell } from '@/features/notifications/components/NotificationBell'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'

// super_admin holds question_pools.manage/manage_global (granted directly —
// see backend/drizzle/migrations/0009_add-question-pools-permissions.sql),
// so Pools is nested here alongside Questions under one "Question Bank"
// group — confirmed against routes/index.tsx that both /admin/questions and
// /admin/pools are real, already-built routes, not placeholders.
const NAV_ITEMS = [
  { type: 'link' as const, to: '/admin', label: 'Students', end: true, icon: Users },
  // Item 10 tier 1 — platform structure (colleges + their departments, the
  // latter reached via a Tab inside CollegeListPage itself, not a second
  // nav item). Super-Admin-only by the route's own RequireRole placement,
  // matching every other item in this list.
  { type: 'link' as const, to: '/admin/colleges', label: 'Colleges', end: true, icon: Building2 },
  { type: 'link' as const, to: '/admin/batches', label: 'Batches', end: true, icon: BookOpen },
  { type: 'link' as const, to: '/admin/faculty', label: 'Faculty', end: true, icon: UserCog },
  // Phase 5, Super-Admin-only (brief §3.7) — which trainer works in which
  // college/department/batch, plus performance trends. Presentation (not
  // UserCog again): UserCog is already Faculty's own icon two rows up, and
  // this is conceptually a different surface (assignment/performance
  // overview, not account management) even though both are about the same
  // underlying faculty users.
  { type: 'link' as const, to: '/admin/trainers', label: 'Trainers', end: true, icon: Presentation },
  {
    type: 'group' as const,
    label: 'Question Bank',
    icon: Library,
    children: [
      { to: '/admin/questions', label: 'Questions', end: true, icon: HelpCircle },
      { to: '/admin/pools', label: 'Pools', end: true, icon: Layers },
    ],
  },
  { type: 'link' as const, to: '/admin/assessments', label: 'Assessments', end: true, icon: ClipboardList },
  { type: 'link' as const, to: '/admin/analytics', label: 'Analytics', end: true, icon: BarChart3 },
]

const NAV_LINK_CLASSNAME = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-2.5 rounded-md border-l-4 px-3 py-2 font-heading text-sm font-medium tracking-tight transition-colors',
    isActive
      ? 'border-brand-accent bg-brand-accent/10 text-brand-accent'
      : 'border-transparent text-muted-foreground hover:bg-muted hover:text-brand-primary',
  )

function SidebarNav() {
  const location = useLocation()

  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
      {NAV_ITEMS.map((item) => {
        if (item.type === 'link') {
          return (
            <NavLink key={item.to} to={item.to} end={item.end} className={NAV_LINK_CLASSNAME}>
              <item.icon className="size-4 shrink-0" />
              {item.label}
            </NavLink>
          )
        }

        const isChildActive = item.children.some((child) => location.pathname.startsWith(child.to))
        return (
          <Collapsible key={item.label} defaultOpen={isChildActive}>
            <CollapsibleTrigger
              className={cn(
                'group flex w-full items-center gap-2.5 rounded-md border-l-4 px-3 py-2 font-heading text-sm font-medium tracking-tight transition-colors',
                isChildActive
                  ? 'border-transparent text-brand-primary'
                  : 'border-transparent text-muted-foreground hover:bg-muted hover:text-brand-primary',
              )}
            >
              <item.icon className="size-4 shrink-0" />
              <span className="flex-1 text-left">{item.label}</span>
              <ChevronDown className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1 pt-1 pl-4">
              {item.children.map((child) => (
                <NavLink key={child.to} to={child.to} end={child.end} className={NAV_LINK_CLASSNAME}>
                  <child.icon className="size-4 shrink-0" />
                  {child.label}
                </NavLink>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )
      })}
    </nav>
  )
}

function AdminLayout() {
  const user = useAuthStore((state) => state.user)
  const navigate = useNavigate()
  const logout = useLogout()
  const firstName = user?.fullName?.split(' ')[0]

  function handleLogout() {
    logout.mutate(undefined, { onSuccess: () => navigate('/login', { replace: true }) })
  }

  return (
    <div className="flex min-h-screen">
      {/* Fixed left sidebar — matches the dark-sidebar/inventory dashboard
          references (logo top, vertical nav, user block pinned to bottom).
          `sticky top-0 h-screen` rather than `fixed` + manual margin on the
          content column: it keeps the sidebar pinned during scroll without
          needing a matching padding-left value kept in sync elsewhere. */}
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="flex h-16 shrink-0 items-center border-b border-sidebar-border px-4">
          {/* logo.jpeg is a 1600x1600 square canvas with the actual wordmark
              centered in a thin horizontal band (heavy white padding
              top/bottom) — object-cover on a wide/short box crops to just
              that band instead of squashing the whole square down to
              illegible height, without touching the source asset. */}
          <img src={logo} alt="JCS iLearn" className="h-10 w-44 object-cover" />
        </div>

        <SidebarNav />

        {/* User block pinned to the bottom — also where the "Welcome back"
            greeting lives (see UserMenu.tsx's `greeting` prop). */}
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

      {/* min-w-0 is load-bearing here: without it, this flex child refuses
          to shrink below its content's intrinsic width (a common flexbox
          gotcha), which would let the search input push the column wider
          than the viewport instead of wrapping/scrolling within it. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center justify-end gap-4 border-b border-border bg-background/95 px-6 shadow-sm backdrop-blur supports-backdrop-filter:bg-background/80">
          <div className="relative min-w-96">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search students, assessments, questions, pools…"
              className="w-full pl-8"
            />
          </div>
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

export default AdminLayout
