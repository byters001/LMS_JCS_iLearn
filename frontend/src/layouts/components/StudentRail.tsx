import type { LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'

export interface StudentRailNavItem {
  to: string
  label: string
  end?: boolean
  icon: LucideIcon
}

interface StudentRailProps {
  navItems: StudentRailNavItem[]
}

// Student portal's hybrid nav rail. Unlike the shared Sidebar.tsx
// (hover-to-expand, used by Admin/Trainer), this rail is permanently
// icon-only at a fixed width — no expand/collapse needed at this width, so
// there's no useState toggle here at all, just a static w-16 column.
// Tooltip-on-hover reuses the exact same native `title` attribute
// Sidebar.tsx already relies on for its own collapsed state, rather than
// pulling in a Radix Tooltip dependency for one component.
//
// Full UI overhaul phase — now themed with the same --sidebar-* tokens as
// Sidebar.tsx (previously its own student-rail-* palette), so all three
// roles share one permanently-dark nav rail, matching the reference
// dashboard's dense dark-rail convention. The rail itself does NOT respond
// to the light/dark content toggle, same as Sidebar.tsx.
export function StudentRail({ navItems }: StudentRailProps) {
  return (
    <aside className="sticky top-0 flex h-screen w-16 shrink-0 flex-col border-r border-sidebar-border bg-sidebar print:hidden">
      <div className="flex h-14 shrink-0 items-center justify-center border-b border-sidebar-border">
        <img src="/jcs-logo.png" alt="JCS iLearn" className="size-9 object-contain" />
      </div>

      <nav className="flex-1 space-y-1.5 overflow-y-auto px-2 py-2.5">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            title={item.label}
            aria-label={item.label}
            className={({ isActive }) =>
              cn(
                'flex items-center justify-center rounded-md px-0 py-2.5 outline-none transition-colors duration-150 ease-out',
                'focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sidebar)]',
                isActive
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              )
            }
          >
            <item.icon className="size-6 shrink-0" />
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
