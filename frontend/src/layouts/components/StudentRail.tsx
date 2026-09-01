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

// Parchment & Emerald hybrid nav — Student portal only. Unlike the shared
// Sidebar.tsx (hover-to-expand, used by Admin/Trainer), this rail is
// permanently icon-only at a fixed width: the brief calls for "no expand/
// collapse needed at this width", so there's no useState toggle here at
// all, just a static w-16 column. Tooltip-on-hover reuses the exact same
// native `title` attribute Sidebar.tsx already relies on for its own
// collapsed state, rather than pulling in a Radix Tooltip dependency for
// one component.
export function StudentRail({ navItems }: StudentRailProps) {
  return (
    <aside className="sticky top-0 flex h-screen w-16 shrink-0 flex-col border-r border-student-rail-border bg-student-rail print:hidden">
      <div className="flex h-14 shrink-0 items-center justify-center border-b border-student-rail-border">
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
                'focus-visible:ring-2 focus-visible:ring-student-rail-active focus-visible:ring-offset-2 focus-visible:ring-offset-student-rail',
                isActive
                  ? 'bg-student-rail-active text-student-rail-active-foreground'
                  : 'text-student-rail-foreground hover:bg-white/5 hover:text-white',
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
