import { ChevronDown, MoreHorizontal, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import logo from '@/assets/brand/logo.jpeg'
import { UserMenu } from '@/components/UserMenu'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type { AuthUser } from '@/store/authStore'

export type SidebarNavItem =
  | { type: 'link'; to: string; label: string; end?: boolean; icon: LucideIcon }
  | {
      type: 'group'
      label: string
      icon: LucideIcon
      children: { to: string; label: string; end?: boolean; icon: LucideIcon }[]
    }

interface SidebarProps {
  navItems: SidebarNavItem[]
  user: AuthUser | null
  onLogout: () => void
  isLoggingOut: boolean
}

function navLinkClassName(collapsed: boolean) {
  return ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-2.5 rounded-md border-l-4 py-2 font-heading text-sm font-medium tracking-tight transition-colors',
      collapsed ? 'justify-center border-l-0 px-0' : 'px-3',
      isActive
        ? collapsed
          ? 'bg-brand-accent/10 text-brand-accent'
          : 'border-brand-accent bg-brand-accent/10 text-brand-accent'
        : 'border-transparent text-muted-foreground hover:bg-muted hover:text-brand-primary',
    )
}

// Shared shell for Admin/Trainer/Student — same component, three different
// navItems arrays passed in (AttemptLayout deliberately does not use this;
// its exam-mode chrome has no persistent sidebar at all, by design — see
// that file's own comment).
//
// Default is COLLAPSED (icon rail), not expanded — a deliberate reversal of
// this sidebar's previous always-expanded default, per NeoPAT's collapsible-
// rail pattern. `useState` (not Zustand/localStorage): this is a pure UI
// toggle, session-only by request, and store/ is reserved for auth/session
// data per CLAUDE1.md's folder rules (see store/authStore.ts's own "in-
// memory only" comment) — plain component state already satisfies "session
// only, no new storage key" without promoting a UI toggle to global state.
// It naturally resets to collapsed on a full page reload (new component
// mount), which matches "session" scope.
export function Sidebar({ navItems, user, onLogout, isLoggingOut }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(true)
  const location = useLocation()
  const firstName = user?.fullName?.split(' ')[0]

  return (
    <aside
      className={cn(
        'sticky top-0 flex h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <div className={cn('flex h-16 shrink-0 items-center border-b border-sidebar-border', collapsed ? 'justify-center px-2' : 'px-4')}>
        {collapsed ? (
          // Collapsed state swaps the full wordmark for a compact glyph —
          // lucide-react already ships a gear icon (Settings), so no new
          // image asset is needed here (see this task's own logo-asset
          // check for the full reasoning).
          <Settings className="size-6 text-brand-primary" aria-hidden="true" />
        ) : (
          // logo.jpeg is a 1600x1600 square canvas with the actual wordmark
          // centered in a thin horizontal band (heavy white padding
          // top/bottom) — object-cover on a wide/short box crops to just
          // that band instead of squashing the whole square down to
          // illegible height, without touching the source asset.
          <img src={logo} alt="JCS iLearn" className="h-10 w-44 object-cover" />
        )}
      </div>

      <nav className={cn('flex-1 space-y-1 overflow-y-auto py-4', collapsed ? 'px-2' : 'px-3')}>
        {navItems.map((item) => {
          if (item.type === 'link') {
            return (
              <NavLink key={item.to} to={item.to} end={item.end} title={collapsed ? item.label : undefined} className={navLinkClassName(collapsed)}>
                <item.icon className="size-4 shrink-0" />
                {!collapsed && item.label}
              </NavLink>
            )
          }

          // Collapsed rail: a Collapsible trigger with no visible label
          // doesn't make sense in icon-only mode, so flatten the group's
          // children into plain icon links instead — each child already
          // has its own distinct icon (see e.g. AdminLayout's Question
          // Bank group), so nothing is lost, just the grouping chrome.
          if (collapsed) {
            return item.children.map((child) => (
              <NavLink key={child.to} to={child.to} end={child.end} title={child.label} className={navLinkClassName(true)}>
                <child.icon className="size-4 shrink-0" />
              </NavLink>
            ))
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
                  <NavLink key={child.to} to={child.to} end={child.end} className={navLinkClassName(false)}>
                    <child.icon className="size-4 shrink-0" />
                    {child.label}
                  </NavLink>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )
        })}
      </nav>

      {/* Toggle row — sits directly below the nav icons, above the user
          block. `nav` above is flex-1, so this and the user block below it
          stay pinned to the bottom together regardless of nav item count. */}
      <div className={cn('shrink-0 border-t border-sidebar-border', collapsed ? 'flex justify-center py-2' : 'p-2')}>
        <button
          type="button"
          onClick={() => setCollapsed((current) => !current)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'flex items-center justify-center gap-2 rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-brand-primary',
            collapsed ? 'size-9' : 'w-full py-1.5 text-xs font-medium',
          )}
        >
          <MoreHorizontal className="size-4 shrink-0" />
          {!collapsed && <span>Collapse menu</span>}
        </button>
      </div>

      {/* User block pinned to the bottom — also where the "Welcome back"
          greeting lives (see UserMenu.tsx's `greeting` prop). */}
      <div className={cn('shrink-0 border-t border-sidebar-border', collapsed ? 'flex justify-center py-3' : 'p-4')}>
        <UserMenu
          name={user?.fullName ?? ''}
          email={user?.email ?? ''}
          onLogout={onLogout}
          isLoggingOut={isLoggingOut}
          greeting={!collapsed && firstName ? `Welcome back, ${firstName}` : undefined}
          collapsed={collapsed}
        />
      </div>
    </aside>
  )
}
