import { ChevronDown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import logo from '@/assets/brand/logo.jpeg'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

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
// Default is COLLAPSED (icon rail); hovering the whole <aside> expands it,
// leaving on mouseleave collapses it back — replaces the earlier 3-dot
// click-to-toggle (NeoPAT-style hover rail is the more direct interaction
// for a rail this narrow, and removes a click most users didn't need).
// Navigating via a NavLink doesn't fight this: React Router keeps this same
// Sidebar instance mounted across route changes within a layout (only the
// Outlet's child swaps), and the pointer stays over the sidebar through the
// click itself, so mouseleave only fires once the user actually moves away
// — no special-casing needed.
//
// `useState` (not Zustand/localStorage): this is a pure UI toggle, and
// store/ is reserved for auth/session data per CLAUDE1.md's folder rules
// (see store/authStore.ts's own "in-memory only" comment).
export function Sidebar({ navItems }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(true)
  const location = useLocation()

  return (
    <aside
      onMouseEnter={() => setCollapsed(false)}
      onMouseLeave={() => setCollapsed(true)}
      className={cn(
        'sticky top-0 flex h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <div className={cn('flex h-16 shrink-0 items-center border-b border-sidebar-border', collapsed ? 'justify-center px-2' : 'px-4')}>
        {collapsed ? (
          // Collapsed state swaps the full wordmark for just its gear/
          // checkmark mark — the same public/jcs-logo.png asset the login
          // page uses for its brand mark (LoginPage.tsx), not a lucide
          // stand-in icon.
          <img src="/jcs-logo.png" alt="JCS iLearn" className="size-8 object-contain" />
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
    </aside>
  )
}
